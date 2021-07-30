/*
 * SPDX-License-Identifier: Apache-2.0
 */

package main

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract provides functions for managing an Asset
type SmartContract struct {
	contractapi.Contract
}

// CreateAsset issues a new asset to the world state with given details.
func (s *SmartContract) CreateAsset(ctx contractapi.TransactionContextInterface, id string, color string, size int, owner string, appraisedValue int) error {
	exists, err := s.AssetExists(ctx, id)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("the asset %s already exists", id)
	}

	asset := Asset{
		ID:             id,
		Color:          color,
		Size:           size,
		Owner:          owner,
		AppraisedValue: appraisedValue,
	}
	err = savePrivateData(ctx, id)
	if err != nil {
		return err
	}
	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return err
	}
	// add Event data to the transaction data. Event will be published after the block containing
	// this transaction is committed
	err = ctx.GetStub().SetEvent("CreateAsset", assetJSON)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(id, assetJSON)
}

// ReadAsset returns the asset stored in the world state with given id.
func (s *SmartContract) ReadAsset(ctx contractapi.TransactionContextInterface, id string) (*Asset, error) {
	asset, err := readState(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %v", err)
	}

	assetJSON, err := addPrivateData(ctx, asset.ID, asset)
	if err != nil {
		return nil, err
	}
	var asset1 Asset
	err = json.Unmarshal(assetJSON, &asset1)
	if err != nil {
		return nil, err
	}

	return &asset1, nil
}

// UpdateAsset updates an existing asset in the world state with provided parameters.
func (s *SmartContract) UpdateAsset(ctx contractapi.TransactionContextInterface, id string, color string, size int, owner string, appraisedValue int) error {
	asset, err := readState(ctx, id)
	if err != nil {
		return err
	}

	// overwriting original asset with new asset
	asset.Color = color
	asset.Size = size
	asset.Owner = owner
	asset.AppraisedValue = appraisedValue
	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return err
	}

	assetBuffer := new(bytes.Buffer)
	json.NewEncoder(assetBuffer).Encode(assetJSON)

	err = savePrivateData(ctx, id)
	if err != nil {
		return err
	}

	err = ctx.GetStub().SetEvent("UpdateAsset", assetBuffer.Bytes())
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, assetBuffer.Bytes())
}

// DeleteAsset deletes an given asset from the world state.
func (s *SmartContract) DeleteAsset(ctx contractapi.TransactionContextInterface, id string) error {
	asset, err := readState(ctx, id)
	if err != nil {
		return err
	}

	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return err
	}

	assetBuffer := new(bytes.Buffer)
	json.NewEncoder(assetBuffer).Encode(assetJSON)

	err = removePrivateData(ctx, id)
	if err != nil {
		return err
	}

	err = ctx.GetStub().SetEvent("DeleteAsset", assetBuffer.Bytes())
	if err != nil {
		return err
	}

	return ctx.GetStub().DelState(id)
}

// AssetExists returns true when asset with given ID exists in world state
func (s *SmartContract) AssetExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	asset, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %v", err)
	}

	return asset != nil, nil
}

// TransferAsset updates the owner field of asset with given id in world state.
func (s *SmartContract) TransferAsset(ctx contractapi.TransactionContextInterface, id string, newOwner string) error {
	asset, err := readState(ctx, id)
	if err != nil {
		return err
	}

	asset.Owner = newOwner
	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return err
	}
	assetBuffer := new(bytes.Buffer)
	json.NewEncoder(assetBuffer).Encode(assetJSON)

	err = ctx.GetStub().SetEvent("TransferAsset", assetBuffer.Bytes())
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, assetBuffer.Bytes())
}

func savePrivateData(ctx contractapi.TransactionContextInterface, assetKey string) error {
	clientOrg, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("error retrieving clientMSPID: %v", err)
	}
	peerOrg, err := shim.GetMSPID()
	if err != nil {
		return fmt.Errorf("error retrieving peer MSPID: %v", err)
	}
	collection := "_implicit_org_" + peerOrg

	if clientOrg == peerOrg {
		transientMap, err := ctx.GetStub().GetTransient()
		if err != nil {
			return fmt.Errorf("error retrieving transient data: %v", err)
		}
		properties := transientMap["asset_properties"]
		if properties != nil {
			ctx.GetStub().PutPrivateData(collection, assetKey, properties)
		}
	}
	return nil
}

func removePrivateData(ctx contractapi.TransactionContextInterface, assetKey string) error {
	clientOrg, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("error retrieving clientMSPID: %v", err)
	}
	peerOrg, err := shim.GetMSPID()
	if err != nil {
		return fmt.Errorf("error retrieving peer MSPID: %v", err)
	}
	collection := "_implicit_org_" + peerOrg

	if clientOrg == peerOrg {
		return ctx.GetStub().DelPrivateData(collection, assetKey)
	}
	return nil
}

func addPrivateData(ctx contractapi.TransactionContextInterface, assetKey string, asset *Asset) ([]byte, error) {
	clientOrg, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("error retrieving clientMSPID: %v", err)
	}
	peerOrg, err := shim.GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("error retrieving peer MSPID: %v", err)
	}
	collection := "_implicit_org_" + peerOrg

	if clientOrg == peerOrg {
		propertiesBuffer, err := ctx.GetStub().GetPrivateData(collection, assetKey)
		if err != nil {
			return nil, fmt.Errorf("failed to read from private data collection: %v", err)
		}
		var tMap map[string]string
		tMap["ID"] = asset.ID
		tMap["Color"] = asset.Color
		tMap["Owner"] = asset.Owner
		tMap["Size"] = fmt.Sprint(asset.Size)
		tMap["AppraisedValue"] = fmt.Sprint(asset.AppraisedValue)
		if propertiesBuffer != nil && len(propertiesBuffer) > 0.0 {
			var properties string
			err = json.Unmarshal(propertiesBuffer, &properties)
			tMap["asset_properties"] = properties
			assetJson, err := json.Marshal(tMap)
			if err != nil {
				return nil, err
			}
			return assetJson, nil
		}
	}
	return nil, err
}

func readState(ctx contractapi.TransactionContextInterface, id string) (*Asset, error) {
	assetBuffer, err := ctx.GetStub().GetState(id) // get the asset from chaincode state
	if err != nil {
		return nil, fmt.Errorf(`The asset ${id} does not exist: %v`, err)
	}
	var asset Asset
	err = json.Unmarshal(assetBuffer, &asset)
	if err != nil {
		return nil, err
	}

	return &asset, nil
}

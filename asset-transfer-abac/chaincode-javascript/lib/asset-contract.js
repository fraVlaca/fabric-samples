/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Contract } = require('fabric-contract-api');
const {ClientIdentity } = require('fabric-shim');

class AssetContract extends Contract {
// CreateAsset issues a new asset to the world state with given details.
async CreateAsset(ctx, id, color, size, appraisedValue) {
    let err = new ClientIdentity(ctx.stub).assertAttributeValue("abac.creator", "true"); // "stub" is the ChaincodeStub object passed to Init() and Invoke() methods
    if(!err){
        throw new Error("Client not autorized, set abac.creator=true");
    }

    const exists = await this.AssetExists(ctx, id);
    if (exists) {
        throw new Error(`The asset ${id} already exists`);
    }

    const clientID = this.GetSubmittingClientIdentity(ctx);

    const asset = {
        ID: id,
        Color: color,
        Size: size,
        Owner: clientID,
        AppraisedValue: appraisedValue,
    };
    await ctx.stub.putState(id, Buffer.from(JSON.stringify(asset)));
}

// ReadAsset returns the asset stored in the world state with given id.
async ReadAsset(ctx, id) {
    const assetJSON = await ctx.stub.getState(id); // get the asset from chaincode state
    if (!assetJSON || assetJSON.length === 0) {
        throw new Error(`The asset ${id} does not exist`);
    }
    return assetJSON.toString();
}

// UpdateAsset updates an existing asset in the world state with provided parameters.
async UpdateAsset(ctx, id, color, size, appraisedValue) {
    const exists = await this.AssetExists(ctx, id);
    if (!exists) {
        throw new Error(`The asset ${id} does not exist`);
    }

    const clientID = this.GetSubmittingClientIdentity(ctx);

    const assetString = await this.ReadAsset(ctx, id);
    const asset = JSON.parse(assetString);
    
    if (clientID != asset.getOwner()){
        throw new Error("Client not autorized, set abac.creator=true");
    }
    // overwriting original asset with new asset
    const updatedAsset = {
        ID: id,
        Color: color,
        Size: size,
        Owner: clientID,
        AppraisedValue: appraisedValue,
    };
    return ctx.stub.putState(id, Buffer.from(JSON.stringify(updatedAsset)));
}

// DeleteAsset deletes an given asset from the world state.
async DeleteAsset(ctx, id) {
    const exists = await this.AssetExists(ctx, id);
    if (!exists) {
        throw new Error(`The asset ${id} does not exist`);
    }

    const clientID = this.GetSubmittingClientIdentity(ctx);

    const assetString = await this.ReadAsset(ctx, id);
    const asset = JSON.parse(assetString);
    
    if (clientID != asset.getOwner()){
        throw new Error("Client not autorized, set abac.creator=true");
    }

    return ctx.stub.deleteState(id);
}

// AssetExists returns true when asset with given ID exists in world state.
async AssetExists(ctx, id) {
    const assetJSON = await ctx.stub.getState(id);
    return assetJSON && assetJSON.length > 0;
}

// TransferAsset updates the owner field of asset with given id in the world state.
async TransferAsset(ctx, id, newOwner) {
    const assetString = await this.ReadAsset(ctx, id);
    const asset = JSON.parse(assetString);

    const clientID = this.GetSubmittingClientIdentity(ctx);
    
    if (clientID != asset.getOwner()){
        throw new Error("Client not autorized, set abac.creator=true");
    }
    asset.Owner = newOwner;
    await ctx.stub.putState(id, Buffer.from(JSON.stringify(asset)));
}

// GetAllAssets returns all assets found in the world state.
async GetAllAssets(ctx) {
    const allResults = [];
    // range query with empty string for startKey and endKey does an open-ended query of all assets in the chaincode namespace.
    const iterator = await ctx.stub.getStateByRange('', '');
    let result = await iterator.next();
    while (!result.done) {
        const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
        let record;
        try {
            record = JSON.parse(strValue);
        } catch (err) {
            console.log(err);
            record = strValue;
        }
        allResults.push({Key: result.value.key, Record: record});
        result = await iterator.next();
    }
    return JSON.stringify(allResults);
}

// GetSubmittingClientIdentity returns the name and issuer of the identity that
// invokes the smart contract. This function base64 decodes the identity string
// before returning the value to the client or smart contract.
async GetSubmittingClientIdentity(ctx){

    const b64ID = new ClientIdentity(ctx.stub).getID();

    if (b64ID == null){
        throw new Error("failed to retrieve Client ID");
    }

    const decodeID = atob(b64ID);
    
    return String(decodeID);
}
}

module.exports = AssetContract;

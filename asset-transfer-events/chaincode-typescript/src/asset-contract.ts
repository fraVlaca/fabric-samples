/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';

async function savePrivateData(ctx, assetKey) {
	const clientOrg = ctx.clientIdentity.getMSPID();
	const peerOrg = ctx.stub.getMspID();
	const collection = '_implicit_org_' + peerOrg;

	if (clientOrg === peerOrg) {
		const transientMap = ctx.stub.getTransient();
		if (transientMap) {
			const properties = transientMap.get('asset_properties');
			if (properties) {
				await ctx.stub.putPrivateData(collection, assetKey, properties);
			}
		}
	}
}

async function removePrivateData(ctx, assetKey) {
	const clientOrg = ctx.clientIdentity.getMSPID();
	const peerOrg = ctx.stub.getMspID();
	const collection = '_implicit_org_' + peerOrg;

	if (clientOrg === peerOrg) {
		const propertiesBuffer = await ctx.stub.getPrivateData(collection, assetKey);
		if (propertiesBuffer && propertiesBuffer.length > 0) {
			await ctx.stub.deletePrivateData(collection, assetKey);
		}
	}
}

async function addPrivateData(ctx, assetKey, asset) {
	const clientOrg = ctx.clientIdentity.getMSPID();
	const peerOrg = ctx.stub.getMspID();
	const collection = '_implicit_org_' + peerOrg;

	if (clientOrg === peerOrg) {
		const propertiesBuffer = await ctx.stub.getPrivateData(collection, assetKey);
		if (propertiesBuffer && propertiesBuffer.length > 0) {
			const properties = JSON.parse(propertiesBuffer.toString());
			asset.asset_properties = properties;
		}
	}
}

async function readState(ctx, id) {
	const assetBuffer = await ctx.stub.getState(id); // get the asset from chaincode state
	if (!assetBuffer || assetBuffer.length === 0) {
		throw new Error(`The asset ${id} does not exist`);
	}
	const assetString = assetBuffer.toString();
	const asset = JSON.parse(assetString);

	return asset;
}
@Info({title: 'AssetTransferEvents', description: 'Smart Contract for trading assets and generate events' })
export class AssetTransferEvents extends Contract {

	// CreateAsset issues a new asset to the world state with given details.
    @Transaction()
    public async CreateAsset(ctx: Context, id: string, color: string, size: number, owner: string, appraisedValue: number): Promise<void> {
		const asset = {
			ID: id,
			Color: color,
			Size: size,
			Owner: owner,
			AppraisedValue: appraisedValue,
		};
		await savePrivateData(ctx, id);
		const assetBuffer = Buffer.from(JSON.stringify(asset));

		ctx.stub.setEvent('CreateAsset', assetBuffer);
		return ctx.stub.putState(id, assetBuffer);
	}

	// TransferAsset updates the owner field of an asset with the given id in
	// the world state.
	async TransferAsset(ctx, id, newOwner) {
		const asset = await readState(ctx, id);
		asset.Owner = newOwner;
		const assetBuffer = Buffer.from(JSON.stringify(asset));
		await savePrivateData(ctx, id);

		ctx.stub.setEvent('TransferAsset', assetBuffer);
		return ctx.stub.putState(id, assetBuffer);
	}

	// ReadAsset returns the asset stored in the world state with given id.
    @Transaction(false)
    @Returns('String')
    public async ReadAsset(ctx: Context, id: string): Promise<String> {
		const asset = await readState(ctx, id);
		await addPrivateData(ctx, asset.ID, asset);

		return JSON.stringify(asset);
	}

	// UpdateAsset updates an existing asset in the world state with provided parameters.
    @Transaction()
    public async UpdateAsset(ctx: Context, id: string, color: string, size: number, owner: string, appraisedValue: number): Promise<void> {
		const asset = await readState(ctx, id);
		asset.Color = color;
		asset.Size = size;
		asset.Owner = owner;
		asset.AppraisedValue = appraisedValue;
		const assetBuffer = Buffer.from(JSON.stringify(asset));
		await savePrivateData(ctx, id);

		ctx.stub.setEvent('UpdateAsset', assetBuffer);
		return ctx.stub.putState(id, assetBuffer);
	}

	// DeleteAsset deletes an given asset from the world state.
    @Transaction()
    public async DeleteAsset(ctx: Context, assetId: string): Promise<void> {
		const asset = await readState(ctx, assetId);
		const assetBuffer = Buffer.from(JSON.stringify(asset));
		await removePrivateData(ctx, assetId);

		ctx.stub.setEvent('DeleteAsset', assetBuffer);
		return ctx.stub.deleteState(assetId);
	}
}

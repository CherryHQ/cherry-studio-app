import {
  getAllBlocks as _getAllBlocks,
  getBlockById as _getBlockById,
  removeAllBlocks as _removeAllBlocks,
  removeManyBlocks as _removeManyBlocks,
  updateOneBlock as _updateOneBlock,
  upsertBlocks as _upsertBlocks
} from '@db/queries/messageBlocks.queries'

import type { MessageBlock } from '@/types/message'

export async function upsertBlocks(blocks: MessageBlock | MessageBlock[]) {
  return _upsertBlocks(blocks)
}

export async function removeManyBlocks(blockIds: string[]) {
  return _removeManyBlocks(blockIds)
}

export async function removeAllBlocks() {
  return _removeAllBlocks()
}

export async function updateOneBlock(update: { id: string; changes: Partial<MessageBlock> }) {
  return _updateOneBlock(update)
}

export async function getBlockById(blockId: string) {
  return _getBlockById(blockId)
}

export async function getAllBlocks() {
  return _getAllBlocks()
}

export const messageBlockDatabase = {
  upsertBlocks,
  removeManyBlocks,
  removeAllBlocks,
  updateOneBlock,
  getBlockById,
  getAllBlocks
}

export const LAN_TRANSFER_SERVICE_TYPE = 'cherrystudio'
export const LAN_TRANSFER_SERVICE_FULL_NAME = '_cherrystudio._tcp'
export const LAN_TRANSFER_DOMAIN = 'local.'
export const LAN_TRANSFER_TCP_PORT = 53317
export const LAN_TRANSFER_PROTOCOL_VERSION = '2'
export const LAN_TRANSFER_MESSAGE_TERMINATOR = '\n'

// File transfer constants
export const LAN_TRANSFER_CHUNK_SIZE = 512 * 1024 // 512KB per chunk
export const LAN_TRANSFER_MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB max
export const LAN_TRANSFER_CHUNK_TIMEOUT_MS = 30000 // 30s per chunk
export const LAN_TRANSFER_GLOBAL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes max for entire transfer
export const LAN_TRANSFER_ALLOWED_EXTENSIONS = ['.zip']
export const LAN_TRANSFER_ALLOWED_MIME_TYPES = ['application/zip', 'application/x-zip-compressed']

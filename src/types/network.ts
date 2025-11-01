export interface ConnectionInfo {
  type: string
  candidates: { host: string; interface: string; priority: number }[]
  selectedHost: string
  port: number
  timestamp: number
}

// Compressed connection data format for QR codes
export type CompressedConnectionInfo = [
  'CSA', // Magic identifier for Cherry Studio App
  number, // Selected IP as number
  number[], // Candidate IPs as numbers
  number, // Port number
  number // Timestamp for uniqueness
]

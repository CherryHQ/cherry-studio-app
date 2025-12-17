/**
 * LAN Transfer Service - Modular Implementation
 *
 * This module provides local network file transfer functionality between
 * the desktop (Electron) and mobile (Expo) clients.
 *
 * Protocol Version: 1.0
 * - Streaming mode (no per-chunk ACK)
 * - Binary frame format for file chunks
 * - JSON messages for control flow
 */

export { lanTransferService } from './LanTransferService'

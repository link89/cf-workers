#!/usr/bin/env node

import net from 'net';
import WebSocket from 'ws';

function log(message, ...args) {
  console.log(new Date(), message, ...args);
}

const main = async (wsUrl) => {

  const server = net.createServer((clientSocket) => {
    log('Client connected');

    clientSocket.once('data', (handshake) => {
      if (handshake[0] !== 0x05) {
        log('Non-SOCKS5 connection');
        clientSocket.end();
        return;
      }

      // Send a no-authentication response
      clientSocket.write(Buffer.from([0x05, 0x00]));

      // Wait for the client's connection request
      clientSocket.once('data', (request) => {
        const version = request[0];
        const command = request[1];
        const addressType = request[3];
        let address;
        let port;

        if (addressType === 0x01) { // IPv4
          address = `${request[4]}.${request[5]}.${request[6]}.${request[7]}`;
          port = request.readUInt16BE(8);
        } else if (addressType === 0x03) { // Domain name
          const domainNameLength = request[4];
          address = request.toString('utf8', 5, 5 + domainNameLength);
          port = request.readUInt16BE(5 + domainNameLength);
        } else {
          log('Address type not supported');
          clientSocket.end();
          return;
        }

        if (command === 0x01) { // CONNECT
          log(`Connecting to ${address}:${port}`);

          const serverSocket = net.createConnection({ host: address, port: port }, () => {
            clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // Connection established
            clientSocket.pipe(serverSocket);
            serverSocket.pipe(clientSocket);
          });

          serverSocket.on('error', (err) => {
            log('Server socket error:', err.message);
            clientSocket.end();
          });

          serverSocket.on('timeout', () => {
            console.log('Connection timed out');
            serverSocket.end();
            // Optionally notify the client of the timeout
            clientSocket.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // 0x04 is 'Host unreachable' in SOCKS5
          });

        } else {
          log('Command not supported');
          clientSocket.end();
        }
      });
    });

    clientSocket.on('error', (err) => {
      log('Client socket error:', err.message);
    });
  });

  server.listen(1080, () => {
    log('SOCKS5 proxy server listening on port 1080');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
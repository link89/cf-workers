#!/usr/bin/env node

import net from 'net';
import WebSocket from 'ws';

function log(message, ...args) {
  console.log(new Date(), message, ...args);
}

const main = async ({ wsUrl, secret, port = 1080 }) => {

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
          const ws = new WebSocket(wsUrl, {
            headers: {
              authorization: 'Bearer ' + secret,
              'X-Host': `${address}:${port}`,
            }, timeout: 5e3,
          });

          ws.on('open', () => {
            log('WebSocket connection established');
            ws.send('go');  // use first message to trigger connection
            clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // Connection established
            clientSocket.on('data', (data) => {
              ws.send(data);
            });
            ws.on('message', (data) => {
              clientSocket.write(data);
            });
          });
          ws.on('error', (err) => {
            log('WebSocket error:', err.message);
            clientSocket.end();
          });
          ws.on('close', () => {
            log('WebSocket connection closed');
            clientSocket.end();
          });
        } else {
          log('Command not supported:', command);
          clientSocket.end();
        }
      });
    });


  });

  server.listen(port, () => {
    log('SOCKS5 proxy server listening on port:', port);
  });
}

let wsUrl = null;
let port = 1080;
let secret = null;

process.argv.forEach((arg, index) => {
  if (arg === '--wsUrl') {
    wsUrl = process.argv[index + 1];
  } else if (arg === '--port') {
    port = parseInt(process.argv[index + 1], 10);
  } else if (arg === '--secret') {
    secret = process.argv[index + 1];
  }
});

main({ wsUrl, port, secret }).catch((err) => {
  console.error(err);
  process.exit(1);
});
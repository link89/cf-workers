/*
 * A socket tunneling service for Cloudflare Workers.
 * Known limitations:
 * - Cannot connect to some website, for example, openai.com
*/

import { connect } from 'cloudflare:sockets';

const secret = 'secret';  // Change this to your secret

export default {
    async fetch(request) {
        const upgradeHeader = request.headers.get("Upgrade");
        if (upgradeHeader !== "websocket") {
            return new Response("This is a WebSocket server.", {
                status: 400,
            });
        }

        const authorization = request.headers.get("Authorization");
        if (authorization !== `Bearer ${secret}`) {
            return new Response("secret is not matched", {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Bearer realm="default", charset="UTF-8"',
                },
            });
        }

        // Create a WebSocket pair
        const [client, server] = Object.values(new WebSocketPair());
        const [hostname, port] = request.headers.get("X-Host").split(":");

        server.accept();
        server.addEventListener('message', ({ data }) => {
            try {
                // use first message to trigger connection
                console.log(`Connecting to ${hostname}:${port}`);
                const socket = connect({ hostname, port });

                new ReadableStream({
                    start(controller) {
                        server.addEventListener('message', ({ data }) => {
                            console.log('rs: message');
                            controller.enqueue(data);
                        });
                        server.addEventListener('error', e => {
                            console.log('rs: error', e.message);
                            controller.error(e);
                            server.close();
                        });
                        server.addEventListener('close', e => {
                            console.log('rs: close', e);
                            controller.close(e);
                        });
                    },
                    cancel(reason) { 
                        console.log('rs: cancel', reason);
                        server.close(); 
                    }
                }).pipeTo(socket.writable);

                socket.readable.pipeTo(new WritableStream({
                    start(controller) { 
                        server.addEventListener('error', e => {
                            console.log('ws: error', e.message);
                            controller.error(e);
                            server.close();
                        });
                    },
                    write(chunk) { 
                        console.log('ws: write', chunk);
                        server.send(chunk); 
                    }
                }));

            } catch (error) { 
                server.close(); 
                throw error;
            }
        }, { once: true });

        return new Response(null, { status: 101, webSocket: client });
    }
}
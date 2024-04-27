import http from "http";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import pretty from "pino-pretty";
import { Server, Socket } from "socket.io";

const PORT = process.env.PORT;

const stream = pretty({
  colorize: true,
  translateTime: "SYS:h:MM:ss TT",
  ignore: "pid,hostname",
});

const logger = pino({}, stream);

const httpLogger = pinoHttp({ level: "info" }, stream);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  path: "/api/socket",
  addTrailingSlash: false,
  cors: { origin: process.env.CORS_ORIGINS },
});

export type ClientProps = {
  id: string;
  roomId: string;
  sender?: string;
};

const clients = new Map<Socket, ClientProps>();

io.on("connection", (socket) => {
  const roomId = socket.handshake?.query?.roomId as string;
  socket.broadcast.to(roomId).emit("welcome", socket.id);

  const metadata = {
    id: socket.id,
    roomId,
  };

  socket.join(roomId);
  clients.set(socket, metadata);

  socket.on("connect:update_board", (payload) => {
    if (clients.size <= 1) {
      return;
    }

    const { welcomeId, board } = payload;
    const client = clients.get(socket);

    if (!client) {
      return;
    }

    socket.to(welcomeId).emit("update:board_updated", JSON.stringify(board));
  });

  socket.on("update:board", (payload) => {
    const client = clients.get(socket);

    if (!client) {
      return;
    }

    socket.to(client.roomId).emit("update:board_updated", payload);
  });

  socket.on("disconnect", async () => {
    clients.delete(socket);
  });
});

app.use(httpLogger);

server.listen(PORT, () => {
  logger.info(`listening on *:${PORT}`);
});

const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const port = 3000;

// Pages
const game = path.join(__dirname, '../public/game/');
const home = path.join(__dirname, '/../public/lobby/');
const lobbies = path.join(__dirname, '/../public/lobby/lobbies.html');
const lobby = path.join(__dirname, '/../public/lobby/lobby.html');

// Server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use('/', express.static(home));
app.use('/lobbies', express.static(lobbies));
app.use('/:lobby', express.static(lobby)); // id or name? can express.static pass dynamic info to html page?
app.use('/:lobby/play', express.static(game)); // ?will somehow need to be connected to unique lobby

server.listen(port, () => {
  console.log(`Server is up on port ${port}.`);
});

// Global list of rooms (lobbies)
const rooms = {};

/**
 * Will make the socket leave any rooms that it is a part of
 * @param socket A connected socket.io socket
 */
const leaveRooms = (socket) => {
  const roomsToDelete = [];
  for (const id in rooms) {
    const room = rooms[id];
    // check to see if the socket is in the current room
    if (room.socketIds.includes(socket.id)) {
      socket.leave(id);
      // remove the socket from the room object
      room.socketIds = room.socketIds.filter((i) => i !== socket.id);
    }
    // Prepare to delete any rooms that are now empty
    if (room.socketIds.length == 0) {
      roomsToDelete.push(room);
    }
  }

  // Delete all the empty rooms that we found earlier
  for (const room of roomsToDelete) {
    delete rooms[room.id];
  }
};

// Socket.io
io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected to the server.`);

  /**
   * Fire the game if the lobby has two connected players
   */
  socket.on('GAME_START', (data, callback) => {
    const room = rooms[socket.roomId];

    if (!room) return;

    if (room.sockets.length == 2) {
      for (const client of room.sockets) {
        client.emit('GAME_START');
      }
    }
  });

  // TODO: GAME_TICK

  /**
   * Gets fired every time a player changes direction.
   * @param direction Processed arrow key press indicating which way to move
   */
  socket.on('directionChange', (direction) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    for (const client of room.sockets) {
      // Emit which player (socket.id) moved in which @direction.
    }
  });

  /**
   * Gets fired when someone wants to get the list of rooms
   */
  socket.on('getRoomNames', (data, callback) => {
    const roomNames = [];
    for (const id in rooms) {
      const { name } = rooms[id];
      const room = { name, id };
      roomNames.push(room);
    }

    callback(roomNames);
  });

  /**
   * Gets fired when a user wants to create a new room.
   * Optional @param roomName; defaults to a random unique name if none provided.
   */
  socket.on(
    'createRoom',
    (roomName = uuidv4(), username = uuidv4(), callback) => {
      const room = {
        id: uuidv4(),
        name: roomName,
        socketIds: [],
      };
      socket.username = username;

      rooms[room.id] = room;
      console.log(`user ${socket.username} created room ${roomName}`);

      // have the socket join the room they've just created.
      socket.join(room.name);
      socket.roomId = room.id;
      room.socketIds.push(socket.id);

      console.log(`User ${socket.username} joined ${roomName}`);
      callback(room);

      console.log('global room list: ', rooms);
    },
  );

  /**
   * Gets fired when a player has joined a room.
   */
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms[roomId];
    joinRoom(socket, room);
    callback();
  });

  /**
   * Gets fired when a player leaves a room.
   */
  socket.on('leaveRoom', () => {
    leaveRooms(socket);
  });

  /**
   * Gets fired when a player disconnects from the server.
   */
  socket.on('disconnect', () => {
    console.log('user disconnected');
    leaveRooms(socket);
  });
});

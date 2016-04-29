// Set variables and information for express
var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});

app.use('/client/', express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Server started.");

// Create list as global variable for storing connections
var SOCKET_LIST = {};


// Create super class for players and bullets to inherit from
var Entity = function() {
	var self = {
		x:250,
		y:250,
		spdX:0,
		spdY:0,
		id:""
	}
	self.update = function() {
		self.updatePosition();
	}
	self.updatePosition = function() {
		self.x += self.spdX;
		self.y += self.spdY;
	}
	self.getDistance = function(pt) {
		return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
	}
	return self;
}

// Create player constructor class which inherits from Entity
var Player = function(id) {
	var self = Entity();
	self.id = id;
	self.number = "" + Math.floor(10 * Math.random());
	self.pressingRight = false;
	self.pressingLeft = false;
	self.pressingUp = false;
	self.pressingDown = false;
	self.pressingAttack = false;
	self.mouseAngle = 0;
	self.maxSpd = 10;

	var super_update = self.update;	// Gets function from super class
	self.update = function() {
		self.updateSpd();
		super_update();

		if(self.pressingAttack) {
			self.shootBullet(self.mouseAngle);
		}
	}
	self.shootBullet = function(angle) {
		var b = Bullet(self.id, angle);
		b.x = self.x;
		b.y = self.y;
	}

	// Create player position update speed function
	self.updateSpd = function() {
		if(self.pressingRight)
			self.spdX = self.maxSpd;
		else if(self.pressingLeft)
			self.spdX = -self.maxSpd;
		else 
			self.spdX = 0;

		if(self.pressingUp)
			self.spdY = -self.maxSpd;
		else if(self.pressingDown)
			self.spdY = self.maxSpd;
		else
			self.spdY = 0;
	}
	// Add created player to player list
	Player.list[id] = self;
	return self;
}
// Create empty player list to store player ids 
Player.list = {};
// Create a new instance of Player when called
Player.onConnect = function(socket) {
	// Create player with socket id and add to player list
	var player = Player(socket.id);

	// Update player positions from key press data received from client
	socket.on('keyPress',function(data) {
		if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'up')
			player.pressingUp = data.state;
		else if(data.inputId === 'down')
			player.pressingDown = data.state;
		else if(data.inputId === 'attack')
			player.pressingAttack = data.state;
		else if(data.inputId === 'mouseAngle')
			player.mouseAngle = data.state;
	});


}
Player.onDisconnect = function(socket) {
	delete Player.list[socket.id];
}
Player.updateAll = function() {
	var pack = [];
	for(var i in Player.list) {
		var player = Player.list[i];
		player.update();
		pack.push({
			x:player.x,
			y:player.y,
			number:player.number
		});
	}
	return pack;
}

var Bullet = function(parent, angle) {
	var self = Entity();
	self.id = Math.random();
	self.spdX = Math.cos(angle/180*Math.PI) * 10;
	self.spdY = Math.sin(angle/180*Math.PI) * 10;
	self.parent = parent;
	self.timer = 0;
	self.toRemove = false;
	var super_update = self.update;
	self.update = function() {
		if(self.timer++ > 100)
			self.toRemove = true;
		super_update();

		for(var i in Player.list) {
			var p = Player.list[i]
			if(self.getDistance(p) < 32 && self.parent !== p.id) {
				// handle collision
				self.toRemove = true;
			}
		}
	}
	Bullet.list[self.id] = self;
	return self;
}
Bullet.list = {};
Bullet.updateAll = function() {
	var pack = [];
	for(var i in Bullet.list) {
		var bullet = Bullet.list[i];
		bullet.update();
		if(bullet.toRemove)
			delete Bullet.list[i];
		else
			pack.push({
				x:bullet.x,
				y:bullet.y
		});
	}
	return pack;
}

var debug = true;
// Create socket connection
var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket) {
	// Set socket id and add to socket list upon connection
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;

	Player.onConnect(socket);

	// Remove socket from associated lists upon disconnection
	socket.on('disconnect', function() {
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});

	socket.on('sendMsgToServer',function(data) {
		var playerName = ("" + socket.id).slice(2,7);
		for(var i in SOCKET_LIST) {
			SOCKET_LIST[i].emit('addToChat',playerName + ': ' + data);
		}
	});
	socket.on('evalServer',function(data) {
		if(!debug)
			return
		var res = eval(data);
		socket.emit('evalAnswer',res);
	});
});

// Create package containing player info for each player and send to client every 40ms
setInterval (function() {
	var pack = {
		player:Player.updateAll(),
		bullet:Bullet.updateAll(),
	}

	

	// Send package to each connection
	for(var i in SOCKET_LIST) {
		var socket = SOCKET_LIST[i];
		socket.emit('newPositions',pack);
	}
},1000/25);
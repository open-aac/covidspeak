// To add a new handler, you will need to implement
// a few methods as an object defined on the remote
// object (for example, remote.myvideo)
var remote = remote || {};
Object.assign(remote, {
  start_local_tracks: function(opts) {
    // Resolves a list of objects with the following attributes
    // { type: "video, audio, data", id: "", generate_dom: function...}
    return remote[remote.backend].start_local_tracks(opts);
  },
  add_local_tracks: function(room_id, stream_or_track) {
    // Resolves with a list of track references
    return remote[remote.backend].add_local_tracks(room_id, stream_or_track);
  },
  remove_local_track: function(room_id, track, remember) {
    // Resolves with a track reference
    return remote[remote.backend].remove_local_track(room_id, track, remember);
  },
  send_message: function(room_id, message) {
    // Resolves with the following attributes
    // { message: [Message Object] }
    var str = message;
    if(typeof(str) != 'string') { 
      str.timestamp = (new Date()).getTime();
      str = JSON.stringify(str); 
    }
    return remote[remote.backend].send_message(room_id, str);
  },
  connect_to_remote: function(access, room_key) {
    // Resolves an object with the following attributes
    // { id: "", 
    return new Promise(function(res, rej) {
      remote[remote.backend].connect_to_remote(access, room_key).then(function(room) {
        remote.rooms = remote.rooms || {};
        remote.rooms[room.id] = remote.rooms[room.id] || {};
        remote.rooms[room.id].room = room;
        res(room);
      }, function(err) {
        rej(err);
      });

    })
  },
  user_added: function(room, user) {
    remote.rooms[room.id].users = remote.rooms[room.id].users || {}
    remote.rooms[room.id].users[user.id] = remote.rooms[room.id].users[user.id] || {};
    remote.rooms[room.id].users[user.id].user = user;
    // Trigger for each user that joins, or for each
    // user that is already in the session
    remote.notify('user_added', {
      user: user,
      room: remote.rooms[room.id].room,
      room_id: room.id
    })
  },
  track_added: function(room, user, track) {
    track.added_at = (new Date()).getTime();
    remote.rooms[room.id].users[user.id].tracks = remote.rooms[room.id].users[user.id].tracks || {};
    remote.rooms[room.id].users[user.id].tracks[track.id] = track;
    // Trigger for each track that is added for a remote user
    remote.notify('track_added', {
      track: track,
      user: remote.rooms[room.id].users[user.id].user,
      room: remote.rooms[room.id].room,
      room_id: room.id,
      user_id: user.id
    });
  },
  track_removed: function(room, user, track) {
    remote.rooms[room.id].users[user.id].tracks = remote.rooms[room.id].users[user.id].tracks || {};
    delete remote.rooms[room.id].users[user.id].tracks[track.id];
    var tracks = remote.rooms[room.id].users[user.id].tracks || {};
    var newest = null;
    for(var key in tracks) {
      if(tracks[key].type == track.type) {
        if(!newest || tracks[key].added_at > newest.added_at) {
          newest = tracks[key];
        }
      }
    }
    // Trigger for each track that is added for a remote user
    remote.notify('track_removed', {
      track: track,
      newest_other: newest,
      user: remote.rooms[room.id].users[user.id].user,
      room: remote.rooms[room.id].room,
      room_id: room.id,
      user_id: user.id
    });

  },
  message_received: function(room, user, track, message) {
    // Trigger for each data track message receiveds
    var json = message;
    var user = remote.rooms[room.id].users[user.id].user;
    try {
      json = JSON.parse(json);
      if(json.timestamp && remote.rooms[room.id] && remote.rooms[room.id].users[user.id]) {
        var now = (new Date()).getTime();
        user.ts_offset = (json.timestamp - now);
        remote.rooms[room.id].users[user.id].ts_offset = (json.timestamp - now);
      }
    } catch(e) { }
  
    remote.notify('message', {
      message: json,
      room: remote.rooms[room.id].room,
      user: user,
      track: remote.rooms[room.id].users[user.id].tracks[track.id],
      room_id: room.id,
      track_id: track.id,
      user_id: user.id
    });
  },
  // Helper methods that you can ignore
  notify: function(message_type, payload) {
    var listeners = (remote.listeners || {})[message_type] || [];
    listeners.forEach(function(listener) {
      listener(payload);
    })
  },
  handle_listener: function(message_type, callback, add) {
    var listeners = (remote.listeners || {})[message_type] || [];
    listeners.forEach(function(listener) {
      listener(payload);
    })
    listeners = listeners.filter(function(l) { return l != callback; });
    if(add) {
      listeners.push(callback);
    }
    remote.listeners = remote.listeners || {};
    remote.listeners[message_type] = listeners;
  },
  addEventListener: function(message_type, callback) {
    remote.handle_listener(message_type, callback, true);
  },
  removeEventListener: function(messsage_type, callback) {
    remote.handle_listener(message_type, callback, false);
  },
  join_room: function(room_id) {
    var user_id = room.current_user_id;
    var room_ref = {
      id: room_id,
      user_id: user_id,
      send: function(message) {
        session.send_to_room(room_id, message);
      },
      subroom_id: function(remote_user_id) {
        if(room_ref.raw_users) {
          var me = room_ref.raw_users.find(function(u) { return u.id == room_ref.user_id; });
          var them = room_ref.raw_users.find(function(u) { return u.id == remote_user_id; });
          if(room_ref.raw_users.indexOf(me) != -1 && room_ref.raw_users.indexOf(them) != -1) {
            if(room_ref.raw_users.indexOf(me) < room_ref.raw_users.indexOf(them)) {
              return room_id + "::" + me.id + "::" + them.id;
            } else {
              return room_id + "::" + them.id + "::" + me.id;
            }
          } else {
            console.error("USERS AREN'T IN LIST before calling subroom_id");
          }
        } else {
          console.error("NO USERS DEFINED before calling subroom_id");
          return null;
        }
      }
    };
    session.join_room({room_id: room_id, user_id: user_id}, function(data) {
      if(room_ref.onmessage) {
        room_ref.onmessage(data);
      }
      // console.log("ROOM DATA", data);
    });
    return room_ref;
  }
});

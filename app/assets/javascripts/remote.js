// To add a new handler, you will need to implement
// a few methods as an object defined on the remote
// object (for example, remote.myvideo)
var remote = {
  start_local_tracks: function() {
    // Resolves a list of objects with the following attributes
    // { type: "video, audio, data", id: "", generate_dom: function...}
    return remote[remote.backend].start_local_tracks();
  },
  send_message: function(room_id, message) {
    // Resolves with the following attributes
    // { message: [Message Object] }
    var str = message;
    if(typeof(str) != 'string') { 
      str.timestamp = (new Date()).getTime();
      str = JSON.stringify(str); 
    }
    return remote[remote.backend].send_message(str);
  },
  connect_to_remote: function(token, room_key) {
    // Resolves an object with the following attributes
    // { id: "", 
    return new Promise(function(res, rej) {
      remote[remote.backend].connect_to_remote(token, room_key).then(function(room) {
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
    track.added = (new Date()).getTime();
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
    track.added = (new Date()).getTime();
    remote.rooms[room.id].users[user.id].tracks = remote.rooms[room.id].users[user.id].tracks || {};
    delete remote.rooms[room.id].users[user.id].tracks[track.id];
    // Trigger for each track that is added for a remote user
    remote.notify('track_removed', {
      track: track,
      user: remote.rooms[room.id].users[user.id].user,
      room: remote.rooms[room.id].room,
      room_id: room.id,
      user_id: user.id
    });

  },
  message_recieved: function(room, user, track, message) {
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
  }
};
remote.twilio = {
  start_local_tracks: function() {
    return new Promise(function(res, rej) {
      var local_track = new Twilio.Video.LocalDataTrack();
      remote.twilio.data_track = local_track;
      Twilio.Video.createLocalTracks({
        audio: true,
        video: true
      }).then(function(tracks) {
        tracks.push(local_track);
        remote.twilio.local_tracks = tracks;
        var result = [];
        tracks.forEach(function(track) {
          result.push({
            type: track.kind,
            id: track.name,
            generate_dom: track.attach ? function() { return track.attach(); } : null,
          });
        });
        res(result);
      }, function(err) {
        rej(err);
      })
    });
  },
  connect_to_remote: function(token, room_key) {
    return new Promise(function(res, rej) {
      Twilio.Video.connect(token, { name:room_key, tracks: remote.twilio.local_tracks }).then(function(room) {
        remote.twilio.rooms = remote.twilio.rooms || {};
        remote.twilio.rooms[room_key] = room;
        var room_ref = {
          id: room_key
        };
        res(room_ref);
        var track_participant = function(participant) {
          var participant_ref = {
            id: participant.identity
          };
          remote.user_added(room_ref, participant_ref);
          var add_track = function(track) {
            var track_ref = {
              type: track.kind,
              id: track.name,
              generate_dom: track.attach ? function() { return track.attach(); } : null
            };
            // TODO: can we figure out the video dimensions here?
            remote.track_added(room_ref, participant_ref, track_ref);
            track.on('message', function(data) {
              remote.message_recieved(room_ref, participant_ref, track_ref, data);
            });
          };
          participant.tracks.forEach(function(publication) {
            if (publication.isSubscribed) {
              add_track(publication.track);
            }
          });

          participant.on('trackSubscribed', function(track) {
            add_track(track);
          });  
          participant.on('trackUnsubscribed', function(track) {
            var track_ref = {
              type: track.kind,
              id: track.name
            };
            remote.track_removed(room_ref, participant_ref, track_ref);
          });
        };
        setTimeout(function() {
          room.participants.forEach(function(participant) {
            track_participant(participant);
          });
        }, 100);
        room.on('participantConnected', function(participant) {
          console.log("A remote Participant connected: " + participant);
          track_participant(participant);
        });  
      }, function(err) {
        rej(err);
      });
    });
  },
  send_message: function(message) {
    return new Promise(function(res, rej) {
      if(remote.twilio.data_track) {
        var str = message;
        remote.twilio.data_track.send(str);
        res({sent: message});
      } else {
        rej({error: "no data track found"});
      }
    });
  }
};
remote.backend = 'twilio';
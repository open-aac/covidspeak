// To add a new handler, you will need to implement
// a few methods as an object defined on the remote
// object (for example, remote.myvideo)
var remote = {
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
  start_local_tracks: function(opts) {
    opts = opts || {audio: true, video: true, data: true};
    var init = {};
    if(opts.audio) { init.audio = true; }
    if(opts.video) { init.video = true; }
    return new Promise(function(res, rej) {
      var local_track = new Twilio.Video.LocalDataTrack();
      remote.twilio.data_track = local_track;
      Twilio.Video.createLocalTracks(init).then(function(tracks) {
        if(opts.data) {
          tracks.push(local_track);
        }
        remote.twilio.local_tracks = tracks;
        var result = [];
        tracks.forEach(function(track) {
          result.push({
            type: track.kind,
            id: track.name,
            added: (new Date()).getTime(),
            generate_dom: track.attach ? function() { return track.attach(); } : null,
          });
        });
        res(result);
      }, function(err) {
        rej(err);
      })
    });
  },
  add_local_tracks: function(room_id, stream_or_track) {
    var track_ref = stream_or_track;
    var participant = remote.twilio.rooms[room_id].localParticipant;
    return new Promise(function(res, rej) {
      if(stream_or_track.getTracks) {
        // this is a MediaStream, needs to be converted to a track_ref
        var tracks = [];
        if(stream_or_track.getVideoTracks) {
          var vid = stream_or_track.getVideoTracks()[0];
          var aud = stream_or_track.getAudioTracks()[0];
          if(vid) { tracks.push(new Twilio.Video.LocalVideoTrack(vid, {priority: 'high'})); }
          if(aud) { tracks.push(new Twilio.Video.LocalAudioTrack(aud, {priority: 'high'})); }
        }
        if(tracks.length > 0 && participant) {
          participant.publishTracks(tracks).then(function(local_track_pubs) {
            var list = [];
            local_track_pubs.forEach(function(local_track_pub) {
              remote.twilio.local_tracks.push(local_track_pub.track);
              track_ref = {
                type: local_track_pub.track.kind,
                id: local_track_pub.track.name,
                added: (new Date()).getTime(),
                generate_dom: local_track_pub.track.attach ? function() { return local_track_pub.track.attach(); } : null,
              };
              list.push(track_ref);
            });
            res(list);
          }, function(err) {
            rej(err);
          });
        } else {
          return rej({error: 'no track or participant found'});
        }
      } else {
        var track = (remote.twilio.local_tracks || []).find(function(t) { return t.name == track_ref.id; });
        if(track && participant) {
          participant.publishTrack(track, {priority: 'high'}).then(function(local_track_pub) {
            res([track_ref]);
          }, function(err) {
            rej(err);
          });
        } else {
          return rej({error: 'no track or participant found'});
        }
      }
    });
  },
  remove_local_track: function(room_id, track_ref, remember) {
    return new Promise(function(res, rej) {
      var track = (remote.twilio.local_tracks || []).find(function(t) { return t.name == track_ref.id; });
      var participant = remote.twilio.rooms[room_id].localParticipant;
      if(track && participant) {
        participant.unpublishTrack(track);
        if(!remember) {
          track.stop();
          remote.twilio.local_tracks = (remote.twilio.local_tracks || []).filter(function(t) { return t.name != track_ref.id; });
        }
        res(track_ref);  
      } else {
        rej({error: 'failed to unpublish'});
      }
    })
  },
  connect_to_remote: function(token, room_key) {
    return new Promise(function(res, rej) {
      Twilio.Video.connect(token, { name:room_key, tracks: remote.twilio.local_tracks }).then(function(room) {
        remote.twilio.rooms = remote.twilio.rooms || {};
        remote.twilio.rooms[room_key] = room;
        var room_ref = {
          id: room_key
        };
        var participant = room.localParticipant;
        participant.local_published_tracks = participant.local_published_tracks || {};
        remote.twilio.local_tracks.forEach(function(track) {
          participant.local_published_tracks[track.name] = track;
        })
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
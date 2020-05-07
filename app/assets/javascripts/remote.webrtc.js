var remote = remote || {};

remote.webrtc = {
  rooms: {},
  start_processsing: function(track, callback) {
    // This method will cause track_added to not be
    // triggered until the stream goes live, to help
    // prevent time with a black screen
    if(track.kind == 'video' || track.kind == 'audio') {
      var stream = new MediaStream();
      stream.addTrack(track);
      var elem = document.createElement(track.kind);
      elem.srcObject = stream;
      var loaded_meta = false;
      var do_it = function() {
        if(!loaded_meta) {
          loaded_meta = true;
          callback(remote.webrtc.dom_generator(track));
        }
      };
      elem.onloadedmetadata = do_it;
      setTimeout(do_it, 1000);
    } else {
      callback(null);
    }
  },
  dom_generator: function(track, stream) {
    stream = new MediaStream();
    stream.addTrack(track);  
    return function() {
      if(track.kind == 'audio' || track.kind == 'video') {
        var elem = document.createElement(track.kind);
        elem.srcObject = stream;
        elem.onloadedmetadata = function(e) {
          elem.play();
        };        
        return elem;
      }
      return null;
    };
  },
  track_ref: function(track, stream, id_index) {
    if(!track) { return null; }
    var device_id = track.name;
    if(track.getSettings) {
      device_id = track.getSettings().deviceId;
    }
    var ref = {
      type: track.kind,
      mediaStreamTrack: track,
      device_id: device_id,
      id: id_index + '-' + track.id,
      added: (new Date()).getTime()
    }
    if(track.kind == 'audio' || track.kind == 'video') {
      ref.generate_dom = remote.webrtc.dom_generator(track, stream);
    }
    return ref;
  },
  start_local_tracks: function(opts) {
    return new Promise(function(res, rej) {
      input.request_media(opts).then(function(stream) {
        remote.webrtc.local_tracks = stream.getTracks();
        remote.webrtc.all_local_tracks = [].concat(remote.webrtc.local_tracks);
        var result = [];
        remote.webrtc.local_tracks.forEach(function(track) {
          result.push(remote.webrtc.track_ref(track, stream, 0));
        });
        res(result);
      }, function(err) {
        rej(err);
      })
    });
  },
  add_local_tracks: function(room_id, stream_or_track) {
    var track_ref = stream_or_track;
    var main_room = remote.webrtc.rooms[room_id];
    // If the connection has an empty sender
    // an no active sender sending the current kind,
    // first try replaceTrack on the sender and only
    // if it rejects should you try adding a new track
    console.log("RTC: adding local tracks", stream_or_track);
    return new Promise(function(res, rej) {
      if(stream_or_track.getTracks) {
        var tracks = [];
        if(stream_or_track.getVideoTracks) {
          var vid = stream_or_track.getVideoTracks()[0];
          var aud = stream_or_track.getAudioTracks()[0];
          if(vid) { tracks.push(vid); }
          if(aud) { tracks.push(aud); }
        }
        if(tracks.length > 0) {
          var list = [];
          tracks.forEach(function(track) {
            list.push(remote.webrtc.track_ref(track, null, 0));
            var new_track = false;
            if(remote.webrtc.local_tracks.indexOf(track) == -1) {
              new_track = true;
              remote.webrtc.local_tracks.push(track);
              remote.webrtc.all_local_tracks.push(track);
            }
            track.enabled = true;
            if(new_track) {
              main_room.subroom_ids.forEach(function(subroom_id) {
                var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
                if(pc_ref) {
                  var senders = pc_ref.pc.getSenders();
                  var types = {};
                  var blank_sender = null;
                  senders.forEach(function(s) {
                    if(s.track && !s.track.muted) { types[s.track.kind] = true; }
                    if(!s.track || (s.track.kind == track.kind && s.track.muted)) { blank_sender = blank_sender || s; }
                  });
                  main_room.subrooms[subroom_id][pc_ref.id].tracks = main_room.subrooms[subroom_id][pc_ref.id].tracks || {};
                  main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] || {};
                  main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].track = track;
                  if(!types[track.kind] && blank_sender) {
                    blank_sender.replaceTrack(track).then(function() {
                      setTimeout(function() {
                        main_room.subrooms[subroom_id].renegotiate();
                      }, 100);
                      // success!
                    }, function(err) {
                      // try the fallback approach
                      var sender = pc_ref.pc.addTrack(track, pc_ref.local_stream);
                      main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].sender = sender;
                      setTimeout(function() {
                        main_room.subrooms[subroom_id].renegotiate();
                      }, 100);
                    });
                  } else {
                    var sender = pc_ref.pc.addTrack(track, pc_ref.local_stream);
                    main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].sender = sender;
                    // TODO: on the ipad it wasn't renegotiating at this point, why not???
                    setTimeout(function() {
                      main_room.subrooms[subroom_id].renegotiate();
                    }, 100);
                }
                }
              });
            }
          });
          res(list);
        } else {
          return rej({error: 'no track or connection found'});
        }
      } else {
        var track = (remote.webrtc.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
        if(track_ref.device_id) {
          track = track || (remote.webrtc.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
        }
        if(track && pc) {
          track.enabled = true;
          res([track_ref]);
          if(track.kind == 'video') {
            setTimeout(function() {
              main_room.subrooms[subroom_id].renegotiate();
            }, 100);
          }
          // main_room.subroom_ids.forEach(function(subroom_id) {
          //   var pc = main_room.subrooms[subroom_id].rtcpc;
          //   if(pc) {
          //     var sender = pc.addTrack(track, pc_ref.local_stream);
          //     main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].sender = sender;
          //     main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].track = track;
          //     res([track_ref]);
          //   }
          // });
        } else {
          return rej({error: 'no track or connection found'});
        }
      }
    });
  },
  replace_local_track: function(room_id, track) {
    console.log("RTC: replacing local track", track);
    return new Promise(function(res, rej) {
      var main_room = remote.webrtc.rooms[room_id];
      if(track && main_room) {
        var track_ref = remote.webrtc.track_ref(track, null, 0);
        var finished = 0, errors = [];
        var check_done = function(error) {
          finished++;
          if(error) {
            errors.push(error);
          }
          if(finished >= main_room.subroom_ids.length) {
            if(errors.length > 0) {
              rej(errors.length > 1 ? errors : errors[0]);
            } else {
              var ending_tracks = remote.webrtc.local_tracks = (remote.webrtc.local_tracks || []).filter(function(t) { return t.kind == track.kind; });
              ending_tracks.forEach(function(t) { t.enabled = false; t.stop(); });
              remote.webrtc.local_tracks = (remote.webrtc.local_tracks || []).filter(function(t) { return t.kind != track.kind; });
              remote.webrtc.local_tracks.push(track);
              remote.webrtc.all_local_tracks.push(track);
              console.log("RTC: successfully replaced track!");
              res({added: track_ref});
            }
          }
        };
        main_room.subroom_ids.forEach(function(subroom_id) {
          var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
          var pc = pc_ref && pc_ref.pc;
          var sender = null;
          for(var track_id in ((main_room.subrooms[subroom_id][pc_ref.id] || {}).tracks || {})) {
            if(track_id.match(/^0-.+/)) {
              var subroom_ref = main_room.subrooms[subroom_id][pc_ref.id].tracks[track_id];
              if(subroom_ref.sender && subroom_ref.track.kind == track.kind) {
                sender = subroom_ref.sender;
              }
            }
          }
          if(pc && !sender) {
            pc.getSenders().forEach(function(s) {
              if(s.track && s.track.kind == track.kind) {
                sender = s;
                console.error("RTC: had to resort to fallback lookup for sender");
              }
            })
          }
          if(pc && sender && pc_ref) {
            var old_track = sender.track;
            sender.replaceTrack(track).then(function(res) {
              delete main_room.subrooms[subroom_id][pc_ref.id].tracks['0-' + old_track.id];
              main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] = main_room.subrooms[subroom_id][pc.id].tracks[track_ref.id] || {};
              main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].track = track;
              main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].sender = sender;
              old_track.enabled = false;
              old_track.stop();
              check_done();
            }, function(err) {
              check_done(err);
            });
          } else {
            check_done({error: 'no active tracks found to replace'});
          }
        });
      } else {
        rej({error: 'failed to replace'});
      }
    });
  },
  remove_local_track: function(room_id, track_ref, remember) {
    console.log("RTC: removing local track", track_ref);
    if(!track_ref) { debugger }
    return new Promise(function(res, rej) {
      var track = (remote.webrtc.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
      if(track_ref.device_id) {
        track = track || (remote.webrtc.local_tracks || []).find(function(t) { return t.getSettings().deviceId == track_ref.device_id; });
      }
      var main_room = remote.webrtc.rooms[room_id];
      if(!track) {
        // fallback for unexpected removal
        main_room.subroom_ids.forEach(function(subroom_id) {
          var pc = main_room.subrooms[subroom_id].rtcpc;
          if(pc && !track) {
            pc.getSenders().forEach(function(sender) {
              if(sender.track && ('0-' + sender.track.id) == track_ref.id) {
                console.error("RTC: had to resort to fallback lookup for removable track");
                track = sender.track
              }
            })  
          }
        });
        
      }

      if(track && main_room) {
        track.enabled = false;
        if(!remember) { 
          // This needs to come before we update the connection
          // to prevent a negotiation race condition
          remote.webrtc.local_tracks = (remote.webrtc.local_tracks || []).filter(function(t) { return t.id != track.id; });
          main_room.subroom_ids.forEach(function(subroom_id) {
            var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
            var pc = pc_ref && pc_ref.pc;
            var sender = main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].sender;
            // fallback if we lost the sender
            if(pc && !sender) {
              pc.getSenders().forEach(function(s) {
                if(s.track == track) {
                  console.error("RTC: had to resort for fallback lookup for sender");
                  sender = s;
                }
              });
            }
            if(pc && sender) {
              setTimeout(function() {
                pc.removeTrack(sender);
                delete main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id];
                setTimeout(function() {
                  main_room.subrooms[subroom_id].renegotiate();  
                }, 100);
              }, 100);
            }
          });
          track.stop();
        }
        res(track_ref);  
      } else {
        rej({error: 'failed to unpublish'});
      }
    })
  },
  refresh_remote_tracks: function(room_id, missing_type) {
    var main_room = remote.webrtc.rooms[room_id];
    if(main_room && main_room.subroom_ids) {
      main_room.subroom_ids.forEach(function(subroom_id) {
        var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
        if(pc_ref && pc_ref.pc) {
          pc_ref.pc.getReceivers().forEach(function(rec) {
            if(rec.track && rec.track.readyState != 'ended' && rec.track.enabled) {
              // Track is active, now check that it's not already been added
              main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = main_room.subrooms[subroom_id][pc_ref.id].remote_tracks || {};
              if(!main_room.subrooms[subroom_id][pc_ref.id].remote_tracks[rec.track.id]) {
                var track = rec.track;
                var stream = new MediaStream();
                console.log("RTC: MISSED A TRACK! adding now...", track);
                stream.addTrack(track);
                main_room.add_track(track, stream, pc_ref.id);  
              } else {
                console.log("RTC: found a known track");
              }
            }
          });
        }
      });
    }
  },
  pc_ref: function(type, id) {
    return (remote.webrtc.pcs || []).filter(function(ref) { 
      if(type == 'sub') {
        return ref.subroom_id = id;
      } else {
        return ref.id == type || ref.id == id;
      }
    }).pop();
  },
  initialize: function(remote_user_id, room_id) {
    var main_room = remote.webrtc.rooms[room_id];
    if(!main_room) { return false; }
    var subroom_id = main_room.subroom_id(remote_user_id);
    remote.webrtc.last_user_id = remote_user_id;
    remote.webrtc.last_room_id = room_id;
    var room_owner = subroom_id.split(/::/)[1];
    var initiator = main_room.user_id == room_owner;
    console.log("RTC: setting up room", initiator);
    main_room.subroom_ids = main_room.subroom_ids || [];
    if(main_room.subroom_ids.indexOf(subroom_id) == -1) {
      main_room.subroom_ids.push(subroom_id);
    }
    main_room.subrooms[subroom_id] = main_room.subrooms[subroom_id] || {};
    main_room.subrooms[subroom_id].id_index = main_room.subrooms[subroom_id].id_index || 1;
    main_room.subrooms[subroom_id].to_close = main_room.subrooms[subroom_id].to_close || []
    if(main_room.subrooms[subroom_id].rtcpc) {
      // keep the existing connection running until the new one is activated
      var oldpc = main_room.subrooms[subroom_id].rtcpc;
      var oldpc_ref = remote.webrtc.pc_ref(oldpc.id);
      main_room.subrooms[subroom_id].to_close.push(main_room.subrooms[subroom_id].data);
      main_room.subrooms[subroom_id].to_close.push(oldpc);
      main_room.subrooms[subroom_id].to_close.push({close: function() {
        setTimeout(function() {
          var tracks = main_room.subrooms[subroom_id][oldpc_ref.id].remote_tracks || {};
          for(var key in tracks) {
            if(tracks[key].pc == oldpc) {
              console.log("RTC: track removed in cleanup", tracks[key]);
              tracks[key].track.enabled = false;
              tracks[key].track.stop();
              remote.track_removed(main_room.ref, main_room.users[remote_user_id], tracks[key].ref);
            }
          }
          if(oldpc.signalingState == 'closed' || oldpc.connectionState == 'closed' ) {

          } else {
            oldpc.getSenders().forEach(function(s) {
              if(s.track  ) {
                oldpc.removeTrack(s);
              }
            });
          }
          delete main_room.subrooms[subroom_id][oldpc_ref.id];
          oldpc.close();
        }, 5000);
      }});
    }
    // Ensure all old remote tracks get cleaned up
    var old_remote_tracks = [];
    for(var pc_id in main_room.subrooms[subroom_id]) {
      if(main_room.subrooms[subroom_id][pc_id] && main_room.subrooms[subroom_id][pc_id].remote_tracks) {
        var remote_tracks = main_room.subrooms[subroom_id][pc_id].remote_tracks;
        for(var track_id in remote_tracks) {
          if(remote_tracks[track_id] && remote_tracks[track_id].track) {
            old_remote_tracks.push(remote_tracks[track_id].track);
          }
        }
      }
    }
    if(old_remote_tracks.length > 0) {
      main_room.subrooms[subroom_id].to_close.push({close: function() {
        setTimeout(function() {
          old_remote_tracks.forEach(function(t) { t.enabled = false; t.stop(); });
        }, 5000);
      }});  
    }
    var config = {};
    config.iceServers = main_room.ice;
    config.iceTransportPolicy = 'all';
    config.iceCandidatePoolSize = 2;

    pc = new RTCPeerConnection(config);
    var pc_ref = {
      refState: 'new',
      id: Math.round(Math.random() * 9999) + ""  + (new Date()).getTime(),
      user_id: remote_user_id,
      subroom_id: subroom_id,
      room_id: room_id,
      prevent_reconnect_until: (new Date()).getTime() + 5000,
      pc: pc
    }
    pc.id = pc_ref.id;
    var pc_id = pc_ref.id;
    remote.webrtc.pcs = remote.webrtc.pcs || [];
    remote.webrtc.pcs.push(pc_ref);
    room.pcs = room.pcs || [];
    room.pcs.push(pc);
    pc_ref.local_stream = new MediaStream();
    main_room.subrooms[subroom_id].rtcpc = pc;
    main_room.subrooms[subroom_id].pc_id = pc_id;    
    main_room.subrooms[subroom_id][pc_ref.id] = {};
    main_room.subrooms[subroom_id].negotiating = false;
    main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = {};
    main_room.subrooms[subroom_id][pc_ref.id].tracks = {};

    var local_data = pc.createDataChannel('channel-name');
    local_data.id = local_data.id || '111';
    local_data.addEventListener('open', function() {
      if(local_data.readyState == 'open') {
        // channel is live!
      }
    });
    local_data.addEventListener('close', function() {
      // channel was closed
    });
    main_room.subrooms[subroom_id][pc_ref.id].data = local_data;

    main_room.subrooms[subroom_id].renegotiate = function() {
      if(main_room.subrooms[subroom_id].negotiating) { 
        console.log("RTC: already negotiating");
        return; 
      }
      console.log("RTC: negotiating...")
      main_room.subrooms[subroom_id].negotiating = true;
      setTimeout(function() {
        main_room.subrooms[subroom_id].negotiating = false;
      }, 3000);
      var rtcpc = pc;
      var pc_ref = remote.webrtc.pc_ref(rtcpc.id || pc_id);
      var latest_pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
      if(!initiator) {
        // don't trigger a renegotiation when one is already going on
        if(latest_pc_ref && latest_pc_ref.refState != 'connected') { 
          main_room.send({
            author_id: main_room.user_id,
            target_id: remote_user_id,
            type: 'ping',
            ping: {ming: false, no_existing_connection: true}
          });
        }
        return; 
      }
      if(pc_ref && pc_ref.refState == 'connected') {
        // We can set up a brand new connection which
        // will prevent the old session from pausing while
        // we negotiate
        console.log("RTC: starting new connection due to renegotiate request");
        rtcpc = remote.webrtc.initialize(remote_user_id, main_room.ref.id);
      }
      rtcpc.createOffer({  offerToReceiveAudio: 1, offerToReceiveVideo: 1}).then(function(desc) {
        // if(rtcpc.signalingState != "stable") { console.error("RTC: initializing when NOT STABLE", rtcpc.signalingState); return; }
        rtcpc.setLocalDescription(desc).then(function() {
          console.log("RTC: offer sent", remote_user_id);
          main_room.send({
            target_id: remote_user_id, 
            author_id: main_room.user_id,
            type: 'offer', 
            offer: desc
          });
          // TODO: re-send if things don't progress
        }, function(err) {
          remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
        });
      }, function(err) {
        remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
      });
    };

    pc.addEventListener('datachannel', function(e) {
      // remote data channel added
      var remote_data = event.channel;
      remote_data.addEventListener('message', function(e) {
        remote.message_received(main_room.ref, main_room.users[remote_user_id], {id: "0-" + local_data.id}, e.data);
      });
    });
    main_room.add_track = function(track, stream, pc_id) {
      var pc_ref = remote.webrtc.pc_ref(pc_id);

      var main_room = remote.webrtc.rooms[pc_ref.room_id];
      if(!pc_ref || !track) {
        console.error("RTC: remote track add failed", track, pc_ref);
        return;
      }
      var subroom_id = pc_ref.subroom_id;
      var remote_user_id = pc_ref.user_id;
      console.log("RTC: remote track added", track, pc_ref);
      var add_track = function(track) {
        try {
          var track_ref = remote.webrtc.track_ref(track, null, main_room.subrooms[subroom_id].id_index);
          if(stream && main_room.users[remote_user_id] && stream != main_room.users[remote_user_id].remote_stream) {
            main_room.users[remote_user_id].remote_stream = stream;
          }
          remote.webrtc.start_processsing(track, function(generator) {
            console.log("RTC: remote track processed", track);
            track_ref.generate_dom = generator;
            remote.track_added(main_room.ref, main_room.users[remote_user_id], track_ref);
            main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = main_room.subrooms[subroom_id][pc_ref.id].remote_tracks || {};
            main_room.subrooms[subroom_id][pc_ref.id].remote_tracks[track.id] = {ref: track_ref, track: track, pc: pc_ref.pc};
          });  
        } catch(e) {
          if(location.hostname == 'localhost') {
            alert("track didn't get added! check for the error!");
          }
          console.error("CAUGHT TRACK ADDING ERROR", e);
        };
      };
      var track_id = main_room.subrooms[subroom_id].id_index + "-" + track.id;
      if(!stream) { debugger}
      else {
        remote.webrtc.streams = (remote.webrtc.streams || []).concat([stream]);
        // TODO: this doesn't fire on Safari
        if(!stream.remover_watching) {
          stream.remover_watching = true;
          stream.addEventListener('removetrack', function(event) {
            // TODO: if this is being replaced by a newer version,
            // then don't call track_removed here, call it
            // when the new version goes live instead
            console.log("RTC: track removed due to event", event.track, track_id);
            var track = event.track;
            delete main_room.subrooms[subroom_id][pc_ref.id].remote_tracks[track.id];
            setTimeout(function() {
              remote.track_removed(main_room.ref, main_room.users[remote_user_id], {
                id: track_id,
                type: track.kind
              });  
              track.enabled = false;
              track.stop();
            }, 1000);
          });
          // stream.addEventListener('addtrack', function(event) {
          //   add_track(event.track);
          // });  
        }
      }
      add_track(track);
    }
    pc.addEventListener('track', function(event) {
      var rtcpc = (event.target && event.target.id) ? event.target : pc;
      main_room.add_track(event.track, (event.streams || [])[0], rtcpc.id || pc.id || pc_id);
    });
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/signalingState
    pc.addEventListener('icecandidate', function(e) {
      var pc_ref = remote.webrtc.pc_ref(e.target.id || pc.id || pc_id);
      var remote_user_id = pc_ref.user_id;
      // ice candidate added
      e.candidate;
      if(e.candidate && e.candidate != '') {
        e.candidate.component;
        e.candidate.type;
        e.candidate.foundation;
        e.candidate.protocl;
        e.candidate.address;
        e.candidate.port;
        e.candidate.priority;
        main_room.send({
          author_id: main_room.user_id,
          target_id: remote_user_id,
          type: 'candidate',
          candidate: e.candidate
        });
      } else {
        // add ice candidate to the list for sending to server
        setTimeout(function() {
          main_room.send({
            author_id: main_room.user_id,
            target_id: remote_user_id,
            type: 'candidate',
            candidate: e.candidate
          });  
        }, 10);
      }
    });
    pc.addEventListener('negotiationneeded', function(e) {
      console.log("RTC: needs negotiation");
      main_room.subrooms[subroom_id].renegotiate();
    });
    connected = function(pc) {
      var pc_ref = remote.webrtc.pc_ref(pc.id || pc_id);
      console.log("RTC: connected", pc_ref.id, pc_ref.user_id);
      if(pc_ref.already_connected) { return; }
      pc_ref.already_connected = true;
      (main_room.subrooms[pc_ref.subroom_id].to_close || []).forEach(function(ref) { if(ref) { ref.close(); } });
      main_room.subrooms[pc_ref.subroom_id].to_close = null;
      // we should be live!
      remote.user_added(main_room.ref, main_room.users[pc_ref.user_id]);
    };
    disconnected = function(pc) {
      var pc_ref = remote.webrtc.pc_ref(pc.id || pc_id);
      console.log("RTC: disconnected", pc_ref.id, pc_ref.user_id);
      pc_ref.already_connected = false;
      main_room.already = false;
      remote.user_removed(main_room.ref, main_room.users[pc_ref.user_id]);
      var check_for_reconnect = function() {
        var latest_pc_ref = remote.webrtc.pc_ref((main_room.subrooms[pc_ref.subroom_id] || {}).pc_id || pc.id || pc_id);
        // If we still haven't managed a healthy connection, try again
        if(latest_pc_ref && latest_pc_ref.refState != 'connected') {
          if(main_room.subrooms[latest_pc_ref.subroom_id]) {
            main_room.subrooms[latest_pc_ref.subroom_id].renegotiate();
          }
        } else if(latest_pc_ref && ['new', 'checking', 'connecting'].indexOf(latest_pc_ref.refState) != -1) {
          setTimeout(check_for_reconnect, 5000);
        }
      };
      setTimeout(check_for_reconnect, 5000);
    };
    pc.addEventListener('connectionstatechange', function(e) {
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
      console.log("RTC: state change", e.target.connectionState);
      var pc_ref = remote.webrtc.pc_ref(e.target.id || pc.id || pc_id);
      pc_ref.refState = e.target.connectionState;
      main_room.subrooms[subroom_id].id_index++;
      if(e.target.connectionState == 'failed' || e.target.connectionState == 'disconnected') { 
        if(main_room && main_room.status) { main_room.status({connection_failed: true}); }
        disconnected(e.target);
      } else if(e.target.connectionState == 'connected') {
        connected(e.target);
      }
    });
    pc.addEventListener('iceconnectionstatechange', function(e) {
      console.log("RTC: ice change", e.target.iceConnectionState);
      if(e.target.connectionState === undefined && ['connected', 'disconnected', 'failed'].indexOf(e.target.iceConnectionState) != -1) {
        var pc_ref = remote.webrtc.pc_ref(e.target.id || pc.id || pc_id);
        pc_ref.refState = e.target.iceConnectionState;
        if(e.target.iceConnectionState == 'failed' || e.target.iceConnectionState == 'disconnected') {
          disconnected(e.target);
        } else if(e.target.iceConnectionState == 'connected') {
          connected(e.target);
        }
      }
      if(e.target.iceConnectionState == 'checking') {
        if(main_room && main_room.status) { main_room.status({server_checking: true})}        
      } else if(e.target.iceConnectionState == 'connected') {
        if(main_room && main_room.status) { main_room.status({server_found: true})}        
      }
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
    });
    pc.addEventListener('icegatheringstatechange', function(e) {
      console.log("RTC: ice gather change", e.target.iceGatheringState);
      if(pc.iceGatheringState != 'complete') { return; }
      // see: https://github.com/webrtc/samples/blob/59aea35498839806af937e8ce6aa99aa0bdb9e46/src/content/peerconnection/trickle-ice/js/main.js#L197

    });
    pc.addEventListener('icecandidateerror', function(e) {
      console.log("RTC: candidate error", e.errorCode, e.target);
      if (e.errorCode >= 300 && e.errorCode <= 699) {
        // STUN errors are in the range 300-699. See RFC 5389, section 15.6
        // for a list of codes. TURN adds a few more error codes; see
        // RFC 5766, section 15 for details.
      } else if (e.errorCode >= 700 && e.errorCode <= 799) {
        // Server could not be reached; a specific error number is
        // provided but these are not yet specified.
      }
    });
    console.log("RTC: adding initial local tracks", room.share_tracks, remote.webrtc.local_tracks);
    // Safari only allows streaming one video track, it seems, so add the later ones first
    var tracks_to_send = [];
    var already_added = false;
    remote.webrtc.local_tracks.forEach(function(track) {
      // TODO: this is messy, it shouldn't need to check
      // anything on room object
      if(track.kind == 'video' && track.enabled) {
        if(room.priority_tracks) {
          if(room.priority_tracks.indexOf(track) != -1) {
            tracks_to_send.push(track);
            already_added = true;  
          }
        } else if(!already_added) {
          tracks_to_send.push(track);
          already_added = true;
        }
      } else {
        tracks_to_send.push(track);
      }
    });
    (room.priority_tracks || []).forEach(function(track) {
      if(track.kind == 'audio' && tracks_to_send.indexOf(track) == -1) {
        remote.webrtc.local_tracks.push(track);
        remote.webrtc.all_local_tracks.push(track);
        tracks_to_send.push(track);
      }
    })
    tracks_to_send.forEach(function(track) {
      console.log("RTC: adding local track", track);
      var sender = pc.addTrack(track, pc_ref.local_stream);
      main_room.subrooms[subroom_id][pc_ref.id].tracks = main_room.subrooms[subroom_id][pc_ref.id].tracks || {};
      main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id] || {};
      main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id].sender = sender;
      main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id].track = track;
    });
    main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id] || {};
    main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id].sender = null;
    main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id].track = local_data;
    return pc;
  },
  reconnect: function() {
    if(remote.webrtc.last_room_id && remote.webrtc.rooms[remote.webrtc.last_room_id]) {
      var main_room = remote.webrtc.rooms[remote.webrtc.last_room_id];
      main_room.subroom_ids.forEach(function(subroom_id) {
        if(main_room.subrooms[subroom_id]) {
          main_room.subrooms[subroom_id].renegotiate();
        }
      });  
    }
  },
  connect_to_remote: function(access, room_key, update) {
    return new Promise(function(res, rej) {
      var main_room = remote.join_room(room_key);
      main_room.subrooms = {};
      main_room.subroom_ids = [];
      main_room.ice = access.ice_servers;
      remote.webrtc.rooms = remote.webrtc.rooms || {};
      remote.webrtc.rooms[room_key] = main_room;
      main_room.user_alerts = {};

      var room_ref = {
        id: room_key
      }
      main_room.ref = room_ref;
      main_room.status = update;
      main_room.ready = function(subroom_id, remote_user_id, force) {
        main_room.status({partner_negotiating: true});
        var room_owner = subroom_id.split(/::/)[1];
        var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
        var pc = pc_ref && pc_ref.pc;
        if(!force && main_room.already && pc_ref && pc_ref.refState == 'connected') { console.log("RTC: SKIPPING reconnection because already active"); return; }
        if(pc_ref && ['new'].indexOf(pc_ref.refState) != -1) { console.log("RTC: SKIPPING CONNECTION because already in progress"); return; }
        var already_id = (new Date()).getTime();
        main_room.already = already_id;
        setTimeout(function() {
          if(main_room.already == already_id) {
            main_room.already = false;
          }
        }, 15000);
        console.log("RTC: room has both parties", force, remote_user_id, subroom_id, main_room.already, pc_ref && pc_ref.refState);
        if(room_owner == main_room.user_id) {
          console.log("RTC: starting room as owner");
          var pc = remote.webrtc.initialize(remote_user_id, room_ref.id);
        } else {
          console.log("RTC: waiting for offer from room owner...");
        }
      };
      main_room.onmessage = function(msg) {
        if(msg.type == 'users') {
          main_room.raw_users = msg.list;
          main_room.users = main_room.users || {};
          var me = msg.list.find(function(u) { return u.id == main_room.user_id; });
          if(me && msg.list.indexOf(me) != -1) {
            msg.list.forEach(function(remote_user) {
              main_room.users[remote_user.id] = main_room.users[remote_user.id] || remote_user;
              if(!main_room.user_alerts[remote_user.id]) {
                main_room.user_alerts[remote_user.id] = true;
                if(window.room && window.room.current_room && window.room.current_room.user_id && remote_user.id != window.room.current_room.user_id) {
                  main_room.status({potential_partner_found: true});
                }
                remote.user_added(room_ref, main_room.users[remote_user.id], false);
              }
              if(remote_user.id == me.id) { return; }
              var remote_user_id = remote_user.id;
              var subroom_id = main_room.subroom_id(remote_user_id);
              var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
              var room_owner = subroom_id.split(/::/)[1];
              if(!main_room.subrooms[subroom_id]) {
                var ping = {};
                if(room_owner == main_room.user_id) { ping.mine = true; }
                if(!pc_ref || pc_ref.refState != 'connected') { ping.no_existing_connection = true; }

                console.log("RTC: PING to", remote_user_id, ping);
                main_room.send({
                  author_id: main_room.user_id,
                  target_id: remote_user_id,
                  type: 'ping',
                  ping: ping
                });
              }
            });
          }
        } else if(msg.author_id != main_room.user_id && msg.target_id == main_room.user_id) {
          var subroom_id = main_room.subroom_id(msg.author_id);
          var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
          var pc = pc_ref && pc_ref.pc
          if(msg.type == 'ping') {
            var room_owner = subroom_id.split(/::/)[1];
            var pong = {};
            if(room_owner == main_room.user_id) { pong.mine = true; }
            if(!pc_ref || pc_ref.refState != 'connected') { pong.no_existing_connection = true; }
            main_room.send({
              author_id: main_room.user_id,
              target_id: msg.author_id, 
              type: 'pong',
              pong: pong
            });
            var force = false;
            if(pong.mine && msg.ping.no_existing_connection) {
              force = true;
            }
            console.log("RTC: received PING", subroom_id, msg);
            if(room_owner == main_room.user_id && pc_ref && pc_ref.prevent_reconnect_until && pc_ref.prevent_reconnect_until > (new Date()).getTime()) {
              console.log("RTC: ignoring PING because already working on a connection", subroom_id);
            } else {
              console.log("RTC: sending PONG", subroom_id, pong);
              main_room.ready(subroom_id, msg.author_id, force);
            }
          } if(msg.type == 'pong') {
            // if I'm the initiator and the other user ponged me
            // saying they have no connection, I should clean up the old stuff
            var force = false;
            var room_owner = subroom_id.split(/::/)[1];
            if(room_owner == main_room.user_id && msg.pong.no_existing_connection) {
              force = true;
            }
            console.log("RTC: received PONG", msg);
            if(room_owner == main_room.user_id && pc_ref && pc_ref.prevent_reconnect_until && pc_ref.prevent_reconnect_until > (new Date()).getTime()) {
              console.log("RTC: ignoring PONG because already working on a connection", subroom_id);
            } else {
              main_room.ready(subroom_id, msg.author_id, force);
            }
          } else if(msg.type == 'offer') {
            console.log("RTC: offer received, initializing room on my side", msg.offer);
            // TODO: if(pc.signalingState == 'stable') { console.error("Received offer when stable"); }
            var pc = remote.webrtc.initialize(msg.author_id, room_ref.id);
            pc.setRemoteDescription(msg.offer).then(function() {
              console.log("RTC: remote set");
              pc.createAnswer().then(function(desc) {
                console.log("RTC: answer created");
                pc.setLocalDescription(desc).then(function() {
                  console.log("RTC: sending answer", desc);
                  main_room.send({
                    target_id: msg.author_id,
                    author_id: main_room.user_id,
                    type: 'answer',
                    answer: desc
                  });
                }, function(err) {
                  // TODO: err...
                });
              });
            }, function(err) {
              // TODO: err...
            });
          } else if(main_room.subrooms[subroom_id]) {
            var pc = main_room.subrooms[subroom_id].rtcpc;
            if(msg.type == 'answer' && pc) {
              console.log("RTC: answer received", msg.answer);
              pc.setRemoteDescription(msg.answer).then(function() {
                // web call should just start, yes?
              }, function(err) {

              });
            } else if(msg.type == 'candidate' && pc) {
              console.log("RTC: candidate received", msg.candidate);
              pc.addIceCandidate(msg.candidate || '').then(function() {
                console.log("RTC: candidate added");
                // something happens automagically??
              }, function(err) {
                if(msg.candidate != null) {
                  console.error("RTC: candidate error", err, msg);
                }
              });
            }
          }
        }
      };
      room_ref.defer = main_room.defer;
      res(room_ref);
    });
  },
  send_message: function(room_id, message) {
    return new Promise(function(res, rej) {
      var all_sent = true;
      var main_room = remote.webrtc.rooms[room_id];
      if(main_room) {
        main_room.subroom_ids.forEach(function(subroom_id) {
          var rtcpc = main_room.subrooms[subroom_id].rtcpc;
          var subroom = main_room.subrooms[subroom_id][rtcpc.id];
          if(subroom && subroom.data && subroom.data.readyState == 'open') {
            var str = message;
            subroom.data.send(str);
          } else {
            all_sent = false;
          }
        });
        if(all_sent) {
          res({sent: message});
        } else {
          rej({error: "no data track found for one or more participants", message: message});
        }
      } else {
        rej({error: "room not found"});
      }
    });
  }
};
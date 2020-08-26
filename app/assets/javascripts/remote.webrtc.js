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
          track.initial_track = true;
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
        // Only supports addinig one audio/video track at a time
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
            // Check if the track is already in the list of local tracks
            if(remote.webrtc.local_tracks.indexOf(track) == -1) {
              new_track = true;
              remote.webrtc.local_tracks.push(track);
              remote.webrtc.all_local_tracks.push(track);
            }
            track.enabled = true;
            if(new_track) {
              // If this is a new track, add it to each sub-connection
              main_room.subroom_ids.forEach(function(subroom_id) {
                var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
                if(pc_ref) {
                  var senders = pc_ref.pc.getSenders();
                  var types = {};
                  var blank_sender = null;
                  // Check if we're already sending a track of this kind
                  senders.forEach(function(s) {
                    if(s.track && !s.track.muted) { types[s.track.kind] = true; }
                    if(!s.track || (s.track.kind == track.kind && s.track.muted)) { blank_sender = blank_sender || s; }
                  });
                  main_room.subrooms[subroom_id][pc_ref.id].tracks = main_room.subrooms[subroom_id][pc_ref.id].tracks || {};
                  main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] || {};
                  main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].track = track;
                  // When the non-initiator switches their video feed, it needs more assertion to renegotiate
                  pc_ref.prevent_reconnect_until = 0;
                  main_room.subrooms[subroom_id].renegotiate_harder = true;
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
        var ended_tracks = [];
        var check_done = function(error) {
          finished++;
          if(error) {
            errors.push(error);
          }
          if(finished >= main_room.subroom_ids.length) {
            remote.webrtc.local_tracks = remote.webrtc.local_tracks || [];
            // When all subrooms are updated or errored,
            // remove the ended tracks from the list
            var nearest = remote.webrtc.local_tracks.length;
            ended_tracks.forEach(function(t) {
              var idx = remote.webrtc.local_tracks.indexOf(t);
              if(idx != -1) {
                nearest = Math.min(nearest, idx);
              }
            })
            remote.webrtc.local_tracks = remote.webrtc.local_tracks.filter(function(t) { return ended_tracks.indexOf(t) == -1; });

            if(errors.length > 0) {
              rej(errors.length > 1 ? errors : errors[0]);
            } else {
              // Add the new track if there were no errors
              remote.webrtc.local_tracks.splice(nearest, 0, track);
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
              if(old_track.initial_track) {
                track.initial_track = true;
              }
              old_track.enabled = false;
              old_track.stop();
              ended_tracks.push(old_track);
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
            var sender = pc_ref && track_ref && main_room.subrooms[subroom_id][pc_ref.id] && main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] && main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].sender;
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
              // When the non-initiator switches their video feed, it needs more assertion to renegotiate
              pc_ref.prevent_reconnect_until = 0;
              main_room.subrooms[subroom_id].renegotiate_harder = true;
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
              main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = (main_room.subrooms[subroom_id][pc_ref.id] || {}).remote_tracks || {};
              if(!main_room.subrooms[subroom_id][pc_ref.id].remote_tracks[rec.track.id]) {
                var track = rec.track;
                var stream = new MediaStream();
                console.error("RTC: MISSED A TRACK! adding now...", track);
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
    var res = (remote.webrtc.pcs || []).filter(function(ref) { 
      if(type == 'sub') {
        return ref.subroom_id == id;
      } else {
        return ref.id == type || ref.id == id;
      }
    }).pop();
    if(res && res.pc) {
      res.refState = res.pc.connectionState;
    }
    return res;
  },
  initialize: function(remote_user_id, room_id) {
    var main_room = remote.webrtc.rooms[room_id];
    if(!main_room) { return false; }
    var subroom_id = main_room.subroom_id(remote_user_id);
    remote.webrtc.last_user_id = remote_user_id;
    remote.webrtc.last_room_id = room_id;
    var room_owner = subroom_id.split(/::/)[1];
    var initiator = main_room.user_id == room_owner;
    console.log("RTC: SETTING UP room", initiator);
    main_room.subroom_ids = main_room.subroom_ids || [];
    if(main_room.subroom_ids.indexOf(subroom_id) == -1) {
      main_room.subroom_ids.push(subroom_id);
    }
    remote.webrtc.clean_old_connections(main_room, subroom_id, remote_user_id);

    var config = {};
    config.iceServers = main_room.ice;
    config.iceTransportPolicy = 'all';
    config.iceCandidatePoolSize = 2;

    try {
      pc = new RTCPeerConnection(config);
    } catch(e) {
      console.error(e);
      remote.connection_error(main_room.ref, main_room.users[remote_user_id], 'failed');
      return
    }
    var pc_ref = {
      refState: 'new',
      id: Math.round(Math.random() * 9999) + ""  + (new Date()).getTime(),
      started: (new Date()).getTime(),
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

    main_room.subrooms[subroom_id].renegotiate = function(purpose) {
      if(main_room.subrooms[subroom_id].negotiating) { 
        console.log("RTC: already negotiating");
        return; 
      }
      console.log("RTC: negotiating...");
      main_room.subrooms[subroom_id].negotiating = true;
      main_room.subrooms[subroom_id].renegotiatied = true;
      setTimeout(function() {
        main_room.subrooms[subroom_id].negotiating = false;
      }, 3000);
      var rtcpc = pc;
      var pc_ref = remote.webrtc.pc_ref(rtcpc.id || pc_id);
      var latest_pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
      if(!initiator) {
        // don't trigger a renegotiation when one is already going on
        if(main_room.subrooms[subroom_id].renegotiate_harder || (latest_pc_ref && latest_pc_ref.refState != 'connected')) { 
          console.log("RTC: pinging to ask for new connection");
          main_room.send({
            author_id: main_room.user_id,
            target_id: remote_user_id,
            type: 'ping',
            ping: {ming: false, no_existing_connection: true}
          });
        }
        return; 
      }
      main_room.subrooms[subroom_id].renegotiate_harder = false;
      if(pc_ref && ['connected', 'closed'].indexOf(pc_ref.refState) != -1) {
        // We can set up a brand new connection which
        // will prevent the old session from pausing while
        // we negotiate
        console.log("RTC: starting new connection due to renegotiate request");
        rtcpc = remote.webrtc.initialize(remote_user_id, main_room.ref.id);
      }
      while(rtcpc.getTransceivers().length < 4) {
        rtcpc.extra_video = rtcpc.addTransceiver('video');
        rtcpc.extra_audio = rtcpc.addTransceiver('audio');
      }
      rtcpc.createOffer({  offerToReceiveAudio: 1, offerToReceiveVideo: 1}).then(function(desc) {
        // if(rtcpc.signalingState != "stable") { console.error("RTC: initializing when NOT STABLE", rtcpc.signalingState); return; }
        var state = rtcpc.signalingState;
        rtcpc.original_desc = desc;
        rtcpc.setLocalDescription(desc).then(function() {
          console.log("RTC: offer sent", remote_user_id);
          main_room.send({
            target_id: remote_user_id, 
            author_id: main_room.user_id,
            type: 'offer', 
            offer: desc
          });
        }, function(err) {
          console.error("RTC: connection description error", err, state);
          if(purpose != 'no_connection') {
            // If you're not connected anywhere, then trouble
            // reconnecting is a last-ditch effort, and this
            // error will unnecessarily imply connection
            // is imminent.
            // TODO: add logic to prevent this error when not actually connected
            // remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
          }
        });
      }, function(err) {
        console.error("RTC: offer error", err, rtcpc.signalingState);
        remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
      });
    };

    pc.addEventListener('datachannel', function(e) {
      // remote data channel added
      var remote_data = event.channel;
      remote_data.addEventListener('message', function(e) {
        // If 'update', use the mid mappings to add in
        // camera_track, microphone_track, share_video_track and share_audio_track
        try {
          var json = JSON.parse(e.data);
          if(json && json.action == 'update') {
            var mid_map = {};
            pc.getTransceivers().forEach(function(trans, trans_idx) {
              var mid = (trans.mid || trans_idx).toString();
              if(trans.receiver && trans.receiver.track && trans.receiver.track.readyState != 'ended') {
                mid_map[mid] = trans.receiver.track;
              }
            });
            json.tracks = {};
            if(json.camera && json.camera_mid && mid_map[json.camera_mid]) {
              json.tracks.camera = remote.webrtc.track_ref(mid_map[json.camera_mid], null, main_room.subrooms[subroom_id].id_index);
            }
            if(json.microphone && json.microphone_mid) {
              json.tracks.microphone = remote.webrtc.track_ref(mid_map[json.microphone_mid], null, main_room.subrooms[subroom_id].id_index);
            }
            if(json.sharing && json.share_video_mid) {
              json.tracks.share_video = remote.webrtc.track_ref(mid_map[json.share_video_mid], null, main_room.subrooms[subroom_id].id_index);
            }
            if(json.sharing && json.share_audio_mid) {
              json.tracks.share_audio = remote.webrtc.track_ref(mid_map[json.share_audio_mid], null, main_room.subrooms[subroom_id].id_index);
            }
            remote.message_received(main_room.ref, main_room.users[remote_user_id], {id: "0-" + local_data.id}, json);
            return;
          }
        } catch(e) { }
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
          // For now, we will ignore muted tracks as our
          // multi-transceiver approach seems to cause
          // them to arrive sometimes
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
      if((event.streams || []).length > 0) {
        main_room.add_track(event.track, (event.streams || [])[0], rtcpc.id || pc.id || pc_id);
      }
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
      pc_ref.prevent_reconnect_until = 0;
      remote.webrtc.failed_retries = 0;
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
      // TODO: if the connection never established, or only
      // established for less than 5 seconds, consider
      // that an error and call candidate_error
      var check_for_reconnect = function() {
        var latest_pc_ref = remote.webrtc.pc_ref((main_room.subrooms[pc_ref.subroom_id] || {}).pc_id || pc.id || pc_id);
        // If we still haven't managed a healthy connection, try again
        if(latest_pc_ref && latest_pc_ref.refState != 'connected') {
          if(main_room.subrooms[latest_pc_ref.subroom_id]) {
            latest_pc_ref.prevent_reconnect_until = 0;
            main_room.subrooms[latest_pc_ref.subroom_id].renegotiate_harder = true;
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
    // NOTE: this isn't true, if you add more transceivers in advance
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
          } else if(track.initial_track && track.enabled && track.readyState != 'ended') {
            tracks_to_send.push(track);
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
    console.log("RTC: adding " + tracks_to_send.length + " local tracks", tracks_to_send);
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
    setTimeout(remote.webrtc.poll_status, 15000);
    return pc;
  },
  clean_old_connections(main_room, subroom_id, remote_user_id) {
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
              console.log("RTC: remote track removed in cleanup", tracks[key]);
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
  },
  poll_status: function() {
    if(remote.webrtc.poll_status.timer) {
      clearTimeout(remote.webrtc.poll_status.timer);
    }
    console.log("RTC: checking all connections");
    var all_connections_ended = true;
    var needs_refresh = false;
    remote.webrtc.pcs = remote.webrtc.pcs || [];
    var now = (new Date()).getTime();
    // Old PCs need to be garbage collected or Chrome gets sad
    room.pcs = (room.pcs || []).filter(function(pc) {
      return !pc.ended || pc.ended > now - (30 * 1000);
    });
    // TODO: does this maybe mess things up royally?
    remote.webrtc.pcs = remote.webrtc.pcs.filter(function(pc_ref) {
      // Keep all non-old-and-ended PCs for troubleshooting and recovery
      return !(pc_ref && pc_ref.pc && pc_ref.pc.ended < now - (5 * 60 * 1000));
    });
    if(remote.webrtc.pcs.length > 0) {
      remote.webrtc.has_connected = true;
    }
    (remote.webrtc.all_local_tracks || []).forEach(function(t) {
      if(t.readyState != 'live' || !t.enabled) {
        t.ended = t.ended || now;
      }
    });
    remote.webrtc.all_local_tracks = remote.webrtc.all_local_tracks.filter(function(t) {
      // Keep all non-old-and-ended tracks for troubleshooting
      return !(t && t.ended && t.ended < now - (60 * 1000));
    })
    remote.webrtc.all_local_tracks = [].concat(remote.webrtc.local_tracks);


    remote.webrtc.pcs.forEach(function(pc_ref) {
      if(pc_ref && pc_ref.pc && ['closed', 'failed', 'disconnected'].indexOf(pc_ref.pc.connectionState) != -1) {
        pc_ref.pc.ended = pc_ref.pc.ended || now;
      }
      if(pc_ref && pc_ref.pc && pc_ref.pc.connectionState != 'closed' && pc_ref.pc.connectionState != 'failed') {
        // TODO: check data track to make sure it's still open
        all_connections_ended = false;
        if(pc_ref.pc.connectionState == 'connected') {
          // Sometimes we get in a state where we think we're
          // connected, but nothing is showing. There is
          // a deeper issue but this should patch it...
          var receivers = pc_ref.pc.getReceivers();
          var senders = pc_ref.pc.getSenders();
          var video_muted = true;
          var track_ids = (room.local_tracks || []).map(function(t) { return t.id; }).join('+');
          remote.webrtc.local_issue_ids = remote.webrtc.local_issue_ids || {};
          if((room.local_tracks || []).find(function(t) { return t.type == 'video' && t.mediaStreamTrack && t.mediaStreamTrack.enabled && !t.mediaStreamTrack.muted; })) {
            video_muted = false;
          }
          if(!video_muted && !senders.find(function(r) { return r.track && r.track.kind == 'video' && r.track.enabled && !r.track.muted; })) {
            console.error("Expected to be sending local video but none attached to the stream");
            if(!remote.webrtc.local_issue_ids[track_ids]) {
              needs_refresh = true;
              remote.webrtc.local_issue_ids[track_ids] = true;
            }
          }
          if(!room.mute_audio && !senders.find(function(r) { return r.track && r.track.kind == 'audio' && r.track.enabled && !r.track.muted; })) {
            console.error("Expected to be sending local audio but none attached to the stream");
            if(!remote.webrtc.local_issue_ids[track_ids]) {
              needs_refresh = true;
              remote.webrtc.local_issue_ids[track_ids] = true;
            }  
          }

          room.state_for = room.state_for || {};
          remote.webrtc.remote_issue_ids = remote.webrtc.remote_issue_ids || {};
          if(room.state_for[pc_ref.user_id] && room.state_for[pc_ref.user_id].video) {
            if(!receivers.find(function(r) { return r.track && r.track.kind == 'video' && r.track.enabled && !r.track.muted; })) {
              console.error("Expected to receive remote video but none found");
              if(!remote.webrtc.remote_issue_ids[room.state_for.track_ids]) {
                needs_refresh = true;
                remote.webrtc.remote_issue_ids[room.state_for.track_ids] = true;
              }
            }
          }
          if(room.state_for[pc_ref.user_id] && room.state_for[pc_ref.user_id].audio) {
            if(!receivers.find(function(r) { return r.track && r.track.kind == 'audio' && r.track.enabled && !r.track.muted; })) {
              console.error("Expected to receive remote audio but none found");
              if(!remote.webrtc.remote_issue_ids[room.state_for.track_ids]) {
                needs_refresh = true;
                remote.webrtc.remote_issue_ids[room.state_for.track_ids] = true;
              }
            }
          }
          if(!needs_refresh && pc_ref.started < (new Date()).getTime() - (30 * 1000)) {
            // If we have sustained a connection for at
            // least 30 second and it's not missing
            // anything, clear issue_ids;
            remote.webrtc.local_issue_ids = {};
            remote.webrtc.remote_issue_ids = {};
          }
        } else if(pc_ref.pc.connectionState == 'new' || pc_ref.pc.connectionState == 'connecting' && pc_ref.started < (new Date()).getTime() - (2 * 60 * 1000)) {
          // If after 2 minutes a pc never succeeds in connecting, close it
          pc_ref.pc.close();
        }
      }
    });
    if(!all_connections_ended && !needs_refresh) {
      // If we succeeded in getting an active connection
    }
    if(needs_refresh || (remote.webrtc.has_connected && all_connections_ended)) {
      console.log("RTC: no active connections, try to reconnect");
      remote.webrtc.failed_retries = (remote.webrtc.failed_retries || 0) + 1;
      if(remote.webrtc.failed_retries < 3) {
        remote.webrtc.reconnect();
      } else {
        console.log("RTC: too many failed reconnects, not trying again");
      }
    } else if(!room.active && remote.webrtc.pcs.length > 0 && !all_connections_ended) {
      room.set_active(true);
    }
    remote.webrtc.poll_status.timer = setTimeout(remote.webrtc.poll_status, 3000);
  },
  reconnect: function() {
    if(remote.webrtc.last_room_id && remote.webrtc.rooms[remote.webrtc.last_room_id]) {
      var main_room = remote.webrtc.rooms[remote.webrtc.last_room_id];
      main_room.subroom_ids.forEach(function(subroom_id) {
        if(main_room.subrooms[subroom_id]) {
          main_room.subrooms[subroom_id].disconnected = true;
          main_room.subrooms[subroom_id].renegotiate('no_connection');
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
        if(pc) {
          pc_ref.refState = pc.connectionState;
        }
        if(!force && main_room.already && pc_ref && pc_ref.refState == 'connected') { console.log("RTC: SKIPPING reconnection because already active"); return; }
        if(pc_ref && ['new'].indexOf(pc_ref.refState) != -1) { console.log("RTC: SKIPPING CONNECTION because already in progress"); return; }
        if(pc_ref && pc_ref.refState ==  'closed') {
          pc_ref.prevent_reconnect_until = 0;
        }
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
            (main_room.pending_messages || []).forEach(function(msg) {
              main_room.onmessage(msg);
            });
            main_room.pending_messages = [];
          }
        } else if(msg.type == 'user_coming') {
          if(msg.status == 'training') {
            main_room.status({training_first: true});
          } else {
            main_room.status({waiting_room: true});
          }
        } else if(msg.author_id != main_room.user_id && msg.target_id == main_room.user_id) {
          // If you get a message (such as an offer) before
          // receiving the user list, it won't be actionable,
          // so stash it and make an additional request for the
          // user list.
          if(!main_room.raw_users) {
            main_room.send({type: 'users'});
            main_room.pending_messages = main_room.pending_messages || [];
            main_room.pending_messages.push(msg);
            return;
          }
          var subroom_id = main_room.subroom_id(msg.author_id, true);
          var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
          if(pc_ref && pc_ref.connectionState == 'connected') {
            pc_ref.prevent_reconnect_until = 0;
          }
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
              if(pc.connectionState == 'closed') {
                // do nothing
              } else {
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
          if(message.match(/update/)) {
            var json = null;
            try {
              json = JSON.parse(message);
            } catch(e) { }
            if(json && json.action == 'update') {
              var track_mids = {};
              rtcpc.getTransceivers().forEach(function(trans, trans_idx) {
                var mid = (trans.mid || trans_idx).toString();
                if(trans.sender && trans.sender.track && trans.sender.track.readyState != 'ended') {
                  track_mids[trans.sender.track.id] = mid;
                }
              });
              if(json.camera) {
                var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'video' && t.live_content && t.enabled && !t.muted && t.readyState != 'ended'});
                if(track && track_mids[track.id]) {
                  json.camera_mid = track_mids[track.id];
                }
              }
              if(json.microphone) {
                var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'audio' && t.live_content && t.enabled && !t.muted && t.readyState != 'ended'});
                if(track && track_mids[track.id]) {
                  json.microphone_mid = track_mids[track.id];
                }      
              }
              if(json.sharing) {
                var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'video' && t.share_content && t.enabled && !t.muted && t.readyState != 'ended'});
                if(track && track_mids[track.id]) {
                  json.share_video_mid = track_mids[track.id];
                }      
                var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'audio' && t.share_content && t.enabled && !t.muted && t.readyState != 'ended'});
                if(track && track_mids[track.id]) {
                  json.share_audio_mid = track_mids[track.id];
                }            
              }
              message = JSON.stringify(json);
            }
          }
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
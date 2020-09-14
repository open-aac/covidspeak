var remote = remote || {};
(function() {
  var log = function(verbose) {
    var opts = Array.from(arguments);
    if(verbose === true) {
      opts = opts.slice(1);
    }
    if(verbose === true && localStorage.verbose_logging != 'true') {
      return;
    }
    opts.unshift("RTC:");
    console.log.apply(null, opts);
  }
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
      track.added_ts = track.added_ts || (new Date()).getTime()
      var ref = {
        type: track.kind,
        mediaStreamTrack: track,
        device_id: device_id,
        id: id_index + '-' + track.id,
        added: track.added_ts
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
            track.live_content = true;
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
      log(true, "adding local tracks", stream_or_track);
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
                    senders.forEach(function(s, idx) {
                      var fallback = null;
                      if(s.mid_fallback && s.mid_fallback.match(/^audio/)) { fallback = 'audio'; }
                      if(s.mid_fallback && s.mid_fallback.match(/^video/)) { fallback = 'video'; }
                      s.probable_kind = s.kind || fallback;
                    });
                    var intended_sender = null;
                    var matching_senders = senders.filter(function(s, idx) { return s.probable_kind == track.kind || (s.track && s.track.kind == track.kind) || (!s.kind && !s.track && idx == (track.kind == 'audio' ? 0 : 1)); });
                    if(track.live_track) {
                      intended_sender = matching_senders[0];
                    } else {
                      intended_sender = matching_senders.pop();
                    }
                    if(!intended_sender) {
                      console.error("RTC: could not find sender for track", track);
                    }
                    // Check if we're already sending a track of this kind
                    senders.forEach(function(s) {
                      if(!s.track || (s.track.kind == track.kind && s.track.muted)) { intended_sender = intended_sender || s; }
                    });
                    main_room.subrooms[subroom_id][pc_ref.id].tracks = main_room.subrooms[subroom_id][pc_ref.id].tracks || {};
                    main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id] || {};
                    main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id].track = track;
                    // When the non-initiator switches their video feed, it needs more assertion to renegotiate
                    pc_ref.prevent_reconnect_until = 0;
                    main_room.subrooms[subroom_id].renegotiate_harder = true;
                    if(intended_sender) {
                      var old_track_id = intended_sender.track && intended_sender.track.id;
                      intended_sender.replaceTrack(track).then(function() {
                        if(old_track_id) {
                          remote.webrtc.local_tracks = remote.webrtc.local_tracks.filter(function(t) { return t.id != old_track_id; });
                        }
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
          } else {
            return rej({error: 'no track or connection found'});
          }
        }
      });
    },
    replace_local_track: function(room_id, track) {
      log(true, "replacing local track", track);
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
                log("successfully replaced track!");
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
                  console.error("had to resort to fallback lookup for sender");
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
                if(old_track.live_content) {
                  track.live_content = true;
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
      log("removing local track", track_ref);
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
            var pc = (remote.webrtc.pc_ref('sub', subroom_id) || {}).pc; //main_room.subrooms[subroom_id].rtcpc;
            if(pc && !track) {
              pc.getSenders().forEach(function(sender) {
                if(sender.track && ('0-' + sender.track.id) == track_ref.id) {
                  console.error("had to resort to fallback lookup for removable track");
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
                // main_room.subrooms[subroom_id].renegotiate_harder = true;
                setTimeout(function() {
                  if(pc.connectionState == 'connected') {
                    pc.removeTrack(sender);
                  }
                  delete main_room.subrooms[subroom_id][pc_ref.id].tracks[track_ref.id];
                  setTimeout(function() {
                    // main_room.subrooms[subroom_id].renegotiate();  
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
          var last_update = main_room.subrooms[subroom_id].last_update;
          var active_mids = {};
          if(last_update) {
            ['camera', 'microphonoe', 'share_video', 'share_audio'].forEach(function(key) {
              var check = key.match(/share/) ? 'sharing' : key;
              if(last_update[check] && last_update[key + '_mids']) {
                last_update[key + '_mids'].forEach(function(mid) {
                  active_mids[mid] = true;
                });
              }  
            });
          }
          var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
          if(pc_ref && pc_ref.pc) {
            pc_ref.pc.getTransceivers().forEach(function(trans) {
              var rec = trans.receiver;
              if(!active_mids[trans.mid]) {
                // log(true, "found a disabled track");
              } else if(rec.track && rec.track.readyState != 'ended' && rec.track.enabled) {
                // Track is active, now check that it's not already been added
                main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = (main_room.subrooms[subroom_id][pc_ref.id] || {}).remote_tracks || {};
                if(!main_room.subrooms[subroom_id][pc_ref.id].remote_tracks[rec.track.id]) {
                  var track = rec.track;
                  main_room.subrooms[subroom_id][pc_ref.id].adding_tracks = main_room.subrooms[subroom_id][pc_ref.id].adding_tracks || {};
                  if(!main_room.subrooms[subroom_id][pc_ref.id].adding_tracks[track.id]) {
                    main_room.subrooms[subroom_id][pc_ref.id].adding_tracks[track.id] = true;
                    var stream = new MediaStream();
                    console.error("MISSED A TRACK! adding now...", trans.mid, track.id, track);
                    stream.addTrack(track);
                    main_room.add_track(track, stream, pc_ref.id);  
                  }
                } else {
                  log(true, "found a known track");
                }
              }
            });
          }
        });
      }
    },
    connection_type: function(room_id, user_id) {
      return new Promise(function(resolve, reject) {
        var main_room = remote.webrtc.rooms[room_id];
        var subroom_id = main_room.subroom_id(user_id);
        var pc_ref = remote.webrtc.pc_ref('sub', subroom_id);
        // main_room.subrooms[subroom_id].rtcpc;
        if(pc_ref && pc_ref.refState == 'connected') {
          // LOCAL = host
          // STUN = srflx
          // TURN = relay
          // room.pcs[0].getStats().forEach()
          // find all where s.type == 'candidate-pair' && s.nominated && s.state == 'succeeded' 
          //     and extract localCandidateId and remoteCandidateId
          // find entries where s.id matches those ids
          //     and record protocol, candidateType
          // send this with keepalive to track connection types
          //     so we can see how many hit the TURN server
          if(pc_ref.pc && pc_ref.pc.getStats) {
            pc_ref.pc.getStats(null).then(function(stats) {
              var stats_by_id = {};
              var pairs = [];
              stats.forEach(function(stat) {
                stats_by_id[stat.id] = stat;
                if(stat.type == 'candidate-pair' && stat.nominated && stat.state == 'succeeded') {
                  pairs.push(stat);
                }
              }); 
              var type = null;
              pairs.forEach(function(pair) {
                var local = stats_by_id[pair.localCandidateId];
                var remote = stats_by_id[pair.remoteCandidateId];
                if(local && remote) {
                  log(true, "Stats Candidates", local.candidateType, remote.candidateType);
                  if(remote.candidateType == 'srflx' || remote.candidateType == 'prflx') {
                    type = 'STUN';
                  } else if(remote.candidateType == 'relay') {
                    type = 'TURN';
                  } else if(remote.candidateType == 'host') {
                    type = 'local';
                  } else {
                    console.error("RTC: Unrecognized candidate type", remote.candidateType);
                    reject("unrecognized candidate type")
                  }
                }
              });
              if(type) {
                resolve(type);
              } else {
                reject("no stats found");
              }
              reject("stats not found");
            }, function(err) {
              reject(err);
            })
          }
        } else {
          reject('not found');
        }
      });
    },
    pc_ref: function(type, id) {
      var list = (remote.webrtc.pcs || []).filter(function(ref) { 
        if(type == 'sub') {
          return ref.subroom_id == id;
        } else {
          return ref.id == type || ref.id == id;
        }
      })
      // First try to find a not-ended connection, then
      // fall back to whatever you've got
      var res = list.filter(function(pc_ref) { return ['closed', 'disconnected', 'failed'].indexOf(pc_ref.pc.connectionState) == -1; }).pop();
      res = res || list.pop();

      if(res && res.pc) {
        if(type == 'sub' && res.pc.connectionState == 'connected') {
          if(window.room && window.room.current_room && window.room.current_room.id) {
            var main_room = remote.webrtc.rooms[window.room.current_room.id];
            if(main_room && main_room.subrooms && main_room.subrooms[id]) {
              main_room.subrooms[id].rtcpc = res.pc;
            }
          }
        }
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
      log("SETTING UP room", initiator);
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
        pc.started = (new Date()).getTime();
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
      room.pcs.unshift(pc);
      pc_ref.local_stream = new MediaStream();
      main_room.subrooms[subroom_id].rtcpc = pc;
      main_room.subrooms[subroom_id].pc_id = pc_id;    
      main_room.subrooms[subroom_id][pc_ref.id] = {};
      main_room.subrooms[subroom_id].negotiating = false;
      main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = {};
      main_room.subrooms[subroom_id][pc_ref.id].tracks = {};

      var local_data = pc.createDataChannel('channel-name');
      pc.data_channel = local_data;
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
          log(true, "already negotiating");
          return; 
        }
        log(true, "negotiating...");
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
            log(true, "pinging to ask for new connection");
            main_room.send({
              author_id: main_room.user_id,
              target_id: remote_user_id,
              type: 'ping',
              ping: {mine: false, no_existing_connection: true}
            });
          }
          return; 
        }
        main_room.subrooms[subroom_id].renegotiate_harder = false;
        var active_conn = pc_ref && main_room.subrooms[subroom_id][pc_ref.id];
        if(!pc_ref || !active_conn || ['connected', 'closed'].indexOf(pc_ref.refState) != -1 || purpose == 'bad_reuse') {
          // We can set up a brand new connection which
          // will prevent the old session from pausing while
          // we negotiate
          log(true, "starting new connection due to renegotiate request");
          rtcpc = remote.webrtc.initialize(remote_user_id, main_room.ref.id);
        }
        remote.webrtc.initialize_tracks(rtcpc, main_room, subroom_id, true);

        rtcpc.createOffer().then(function(desc) {
          // if(rtcpc.signalingState != "stable") { console.error("initializing when NOT STABLE", rtcpc.signalingState); return; }
          var state = rtcpc.signalingState;
          rtcpc.original_desc = desc;
          rtcpc.setLocalDescription(desc).then(function() {
            log(true, "offer sent", remote_user_id);
            main_room.send({
              target_id: remote_user_id, 
              author_id: main_room.user_id,
              type: 'offer', 
              offer: desc
            });
          }, function(err) {
            if(err.name == 'OperationError' && err.message && err.message.match(/setLocalDescription/)) {
              return main_room.subrooms[subroom_id].renegotiate('bad_reuse');
            } else if(purpose != 'no_connection') {
              // If you're not connected anywhere, then trouble
              // reconnecting is a last-ditch effort, and this
              // error will unnecessarily imply connection
              // is imminent.
              // TODO: add logic to prevent this error when not actually connected
              // remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
            }
            console.error("connection description error", err, err.name, state);
          });
        }, function(err) {
          console.error("offer error", err, rtcpc.signalingState);
          remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
        });
      };

      pc.addEventListener('datachannel', function(event) {
        // remote data channel added
        var remote_data = event.channel;
        remote_data.subroom_id = subroom_id;
        remote_data.addEventListener('message', function(e) {
          // Ensure you're using the latest active connection for mapping tracks
          var pc_ref = remote.webrtc.pc_ref('sub', e.target.subroom_id || subroom_id);
          var data_pc = pc;
          if(pc_ref && pc_ref.refState == 'connected') {
            data_pc = pc_ref.pc;
          }
          var json = null;
          try {
            json = JSON.parse(e.data);
            // If 'update', use the mid mappings to add in
            // camera_track, microphone_track, share_video_track and share_audio_track
            if(json && json.action == 'update') {
              var mid_map = {};
              data_pc.getTransceivers().forEach(function(trans) {
                var mid = trans.mid;
                var mid_fallback = trans.sender.mid_fallback;
                if(trans.receiver && trans.receiver.track && trans.receiver.track.readyState != 'ended') {
                  mid_map[mid] = trans.receiver.track;
                  mid_map[mid_fallback] = trans.receiver.track;
                }
                // Trust the other side's mapping of mids,
                // only if you don't have them mapped yourself
                if(!trans.kind) {
                  if(json.audio_mids && mid && json.audio_mids.indexOf(mid) != -1) {
                    trans.kind = 'audio';
                    trans.sender.kind = 'audio';
                  }
                  if(json.video_mids && mid && json.video_mids.indexOf(mid) != -1) {
                    trans.kind = 'video';
                    trans.sender.kind = 'video';
                  }
                  if(json.audio_mids && mid_fallback && json.audio_mids.indexOf(mid_fallback) != -1) {
                    trans.kind = 'audio';
                    trans.sender.kind = 'audio';
                  }
                  if(json.video_mids && mid_fallback && json.video_mids.indexOf(mid_fallback) != -1) {
                    trans.kind = 'video';
                    trans.sender.kind = 'video';
                  }
                }
              });
              json.tracks = {};
              ['camera', 'microphone', 'share_audio', 'share_video'].forEach(function(key) {
                var check = key.match(/share/) ? 'sharing' : key;
                var mids_key = key + '_mids';
                var track = json[mids_key] && (mid_map[json[mids_key][0]] || mid_map[json[mids_key][1]]);
                if(json[check] && track) {
                  json.tracks[key] = remote.webrtc.track_ref(track, null, main_room.subrooms[subroom_id].id_index);
                }
              });
              main_room.subrooms[subroom_id].last_update = json;
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
          console.error("remote track add failed", track, pc_ref);
          return;
        }
        var subroom_id = pc_ref.subroom_id;
        main_room.subrooms[subroom_id][pc_ref.id].adding_tracks = main_room.subrooms[subroom_id][pc_ref.id].adding_tracks || {};
        if(main_room.subrooms[subroom_id][pc_ref.id].adding_tracks[track.id]) {
          log(true, 'already adding remote track');
          return;
        }
        main_room.subrooms[subroom_id][pc_ref.id].adding_tracks[track.id] = true;
        var remote_user_id = pc_ref.user_id;
        log(true, "remote track added", track, pc_ref);
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
              log(true, "remote track processed", track);
              track_ref.generate_dom = generator;
              remote.track_added(main_room.ref, main_room.users[remote_user_id], track_ref);
              main_room.subrooms[subroom_id][pc_ref.id].adding_tracks[track.id] = false;
              main_room.subrooms[subroom_id][pc_ref.id].remote_tracks = main_room.subrooms[subroom_id][pc_ref.id].remote_tracks || {};
              main_room.subrooms[subroom_id][pc_ref.id].remote_tracks[track.id] = {ref: track_ref, track: track, pc: pc_ref.pc};
            });  
          } catch(e) {
            main_room.subrooms[subroom_id][pc_ref.id].adding_tracks[track.id] = false;
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
              log(true, "track removed due to event", event.track, track_id);
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
          log(true, 'track add event', event.track.id, event.track);
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
        log(true, "needs negotiation");
        main_room.subrooms[subroom_id].renegotiate();
      });
      connected = function(pc) {
        var pc_ref = remote.webrtc.pc_ref(pc.id || pc_id);
        if(pc_ref.subroom_id && pc.data_channel) {
          pc.data_channel.subroom_id = pc_ref.subroom_id;
        }
        var trans = pc.getTransceivers();
        var zero_type = trans[0] && trans[0].track && trans[0].track.kind;
        var one_type = trans[1] && trans[1].track && trans[1].track.kind;
        if(trans[0] && (zero_type == 'audio' || one_type != 'audio')) {
          trans[0].kind = 'audio';
          trans[0].sender.kind = 'audio';
        }
        if(trans[1] && (zero_type != 'video' || one_type == 'video')) {
          trans[1].kind = 'video';
          trans[1].sender.kind = 'video';
        }
        log("connected", pc_ref.id, pc_ref.user_id);
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
        log(true, "disconnected", pc_ref.id, pc_ref.user_id);
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
        log(true, "state change", e.target.connectionState);
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
        log(true, "ice change", e.target.iceConnectionState);
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
        log(true, "ice gather change", e.target.iceGatheringState);
        if(pc.iceGatheringState != 'complete') { return; }
        // see: https://github.com/webrtc/samples/blob/59aea35498839806af937e8ce6aa99aa0bdb9e46/src/content/peerconnection/trickle-ice/js/main.js#L197

      });
      pc.addEventListener('icecandidateerror', function(e) {
        log(true, "candidate error", e.errorCode, e.target);
        if (e.errorCode >= 300 && e.errorCode <= 699) {
          // STUN errors are in the range 300-699. See RFC 5389, section 15.6
          // for a list of codes. TURN adds a few more error codes; see
          // RFC 5766, section 15 for details.
        } else if (e.errorCode >= 700 && e.errorCode <= 799) {
          // Server could not be reached; a specific error number is
          // provided but these are not yet specified.
        }
      });
      remote.webrtc.initialize_tracks(pc, main_room, subroom_id, initiator);
      main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id] || {};
      main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id].sender = null;
      main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + local_data.id].track = local_data;
      setTimeout(remote.webrtc.poll_status, 15000);
      return pc;
    },
    initialize_tracks: function(pc, main_room, subroom_id, initiator) {
      // TODO: transceiver.mid is still not globally-supported
      // so in the mean time let's create some fake tracks if
      // there aren't ones we're expecting
      var pc_ref = remote.webrtc.pc_ref(pc.id);

      log(true, "adding initial local tracks", room.share_tracks, remote.webrtc.local_tracks);
      var tracks_to_send = [];
      var already_added = false;
      var is_sharing = !!(remote.webrtc.local_tracks.find(function(t) { return t.share_content; }));

      remote.webrtc.local_tracks.forEach(function(track) {
        if(track.kind == 'video' && track.enabled) {
          if(track.live_content) {
            tracks_to_send[1] = track;
          } else {
            tracks_to_send[2] = track;
          }
        } else if(track.kind == 'audio' && track.enabled) {
          if(track.live_content) {
            tracks_to_send[0] = track;
          } else {
            tracks_to_send[3] = track;
          }
        }
      });
      if(navigator.userAgent.match(/Edg\//)) {
        // Edge does not support mid property yet, so we
        // have to ensure the first two tracks are filled
        // so that everything ends up in the right order.
        if(!tracks_to_send[0]) {
          var audio = new Audio();
          audio.src = '/blank_audio.mp3';
          if(audio.captureStream) {
            tracks_to_send[0] = (audio.mozCaptureStream ? audio.mozCaptureStream() : audio.captureStream()).getAudioTracks()[0];
          }
        }
        if(!tracks_to_send[1]) {
          var canvas_elem = document.createElement('canvas');
          if(canvas_elem.captureStream) {
            var stream  = canvas_elem.captureStream(0);
            var canvas_track = stream && stream.getVideoTracks()[0];
            tracks_to_send[1] = canvas_track;
          }
        }  
      }
      (room.priority_tracks || []).forEach(function(track) {
        var found = remote.webrtc.local_tracks.find(function(t) { return t == track || t.mediaStreamTrack == track; });
        if(!found) {
          console.error("PRIORITY TRACK missing from local_tracks list");
        }
      })
      log(true, "adding " + tracks_to_send.length + " local tracks", tracks_to_send);

      if(pc.getSenders().length == 0 && initiator) {
        var t = pc.addTransceiver('audio');
        t.kind = 'audio';
        t.sender.kind = 'audio';
        t.sender.mid_fallback = 'audio0';
        t = pc.addTransceiver('video');
        t.kind = 'video';
        t.sender.kind = 'video';
        t.sender.mid_fallback = 'video1';
        t = pc.addTransceiver('video');
        t.kind = 'video';
        t.sender.kind = 'video';
        t.sender.mid_fallback = 'video2';
        t = pc.addTransceiver('audio');
        t.kind = 'audio';
        t.sender.kind = 'audio';
        t.sender.mid_fallback = 'audio3';
      }

      var transceivers = pc.getTransceivers();
      var sender_map = {};
      transceivers.forEach(function(trans) {
        var kind = trans.kind || trans.sender.kind || (trans.sender.track || {}).kind || (trans.receiver.track || {}).kind;
        if(kind == 'audio') {
          if(sender_map['microphone'] || trans.mid == '3') {
            sender_map['share_audio'] = trans.sender;
            trans.target = 'share_audio';
          } else {
            sender_map['microphone'] = trans.sender;
            trans.target = 'microphone';
          }
        } else if(kind == 'video' || trans.mid == '2') {
          if(sender_map['camera']) {
            sender_map['share_video'] = trans.sender;
            trans.target = 'share_video';
          } else {
            sender_map['camera'] = trans.sender;
            trans.target = 'camera';
          }
        }
      });
      tracks_to_send.forEach(function(track, track_idx) {
        if(!track) { return; }
        var sender = null;
        if(track.live_content) {
          sender = sender_map[(track.kind == 'audio' ? 'microphone' : 'camera')];
        } else {
          sender = sender_map[(track.kind == 'audio' ? 'share_audio' : 'share_video')];
        }
        if(sender) {
          log(true, "adding local track to a known location", track);
          sender.replaceTrack(track);
          sender.kind = track.kind;
        } else {
          log(true, "adding local track wherever it fits", track);
          sender = pc.addTrack(track, pc_ref.local_stream);
          sender.kind = track.kind;
        }
        if(sender.mid_fallback == null) {
          sender.mid_fallback = track.kind + track_idx.toString();
        }
        if(sender) {
          main_room.subrooms[subroom_id][pc_ref.id].tracks = main_room.subrooms[subroom_id][pc_ref.id].tracks || {};
          main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id] = main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id] || {};
          main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id].sender = sender;
          main_room.subrooms[subroom_id][pc_ref.id].tracks["0-" + track.id].track = track;  
        }
      });
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
                log(true, "remote track removed in cleanup", tracks[key]);
                tracks[key].track.enabled = false;
                tracks[key].track.stop();
                remote.track_removed(main_room.ref, main_room.users[remote_user_id], tracks[key].ref);
                delete tracks[key];
              }
            }

            if(oldpc.signalingState == 'closed' || oldpc.connectionState == 'closed' ) {
            } else {
              oldpc.getSenders().forEach(function(s) {
                if(s.track) {
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
      log(true, "checking all connections");
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
        pc_ref.pc.started = pc_ref.pc.started || now;
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
        log("no active connections, try to reconnect");
        remote.webrtc.failed_retries = (remote.webrtc.failed_retries || 0) + 1;
        if(remote.webrtc.failed_retries < 3) {
          remote.webrtc.reconnect();
        } else {
          log("too many failed reconnects, not trying again");
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
          if(!force && main_room.already && pc_ref && pc_ref.refState == 'connected') { log(true, "SKIPPING reconnection because already active"); return; }
          if(pc_ref && ['new'].indexOf(pc_ref.refState) != -1) { log(true, "SKIPPING CONNECTION because already in progress"); return; }
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
          log(true, "room has both parties", force, remote_user_id, subroom_id, main_room.already, pc_ref && pc_ref.refState);
          if(room_owner == main_room.user_id) {
            log(true, "starting room as owner");
            var pc = remote.webrtc.initialize(remote_user_id, room_ref.id);
          } else {
            log(true, "waiting for offer from room owner...");
            // TODO: if room owner doesn't send offer soon, re-ping
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

                  log(true, "PING to", remote_user_id, ping);
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
              log(true, "received PING", subroom_id, msg);
              if(room_owner == main_room.user_id && pc_ref && pc_ref.prevent_reconnect_until && pc_ref.prevent_reconnect_until > (new Date()).getTime()) {
                log(true, "ignoring PING because already working on a connection", subroom_id);
              } else {
                log(true, "sending PONG", subroom_id, pong);
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
              log(true, "received PONG", msg);
              if(room_owner == main_room.user_id && pc_ref && pc_ref.prevent_reconnect_until && pc_ref.prevent_reconnect_until > (new Date()).getTime()) {
                log(true, "ignoring PONG because already working on a connection", subroom_id);
              } else {
                main_room.ready(subroom_id, msg.author_id, force);
              }
            } else if(msg.type == 'offer') {
              log(true, "offer received, initializing room on my side", msg.offer);
              // TODO: if(pc.signalingState == 'stable') { console.error("Received offer when stable"); }
              var pc = remote.webrtc.initialize(msg.author_id, room_ref.id);
              pc.setRemoteDescription(msg.offer).then(function() {
                log(true, "remote set");
                // It's at this point that the second party
                // will have all the transceivers added
                pc.createAnswer().then(function(desc) {
                  log(true, "answer created");
                  pc.setLocalDescription(desc).then(function() {
                    remote.webrtc.initialize_tracks(pc, main_room, subroom_id, false);
                    log(true, "sending answer", desc);
                    main_room.send({
                      target_id: msg.author_id,
                      author_id: main_room.user_id,
                      type: 'answer',
                      answer: desc
                    });
                  }, function(err) {
                    console.error("local description error", err);
                    // TODO: err...
                  });
                }, function(err) {
                  console.error("answer error", err);
                });
              }, function(err) {
                console.error("remote decsription error", err);
              });
            } else if(main_room.subrooms[subroom_id]) {
              var pc = main_room.subrooms[subroom_id].rtcpc;
              if(msg.type == 'answer' && pc) {
                log(true, "answer received", msg.answer);
                pc.setRemoteDescription(msg.answer).then(function() {
                  // web call should just start, yes?
                }, function(err) {

                });
              } else if(msg.type == 'candidate' && pc) {
                log(true, "candidate received", msg.candidate);
                if(pc.connectionState == 'closed') {
                  // do nothing
                } else {
                  pc.addIceCandidate(msg.candidate || '').then(function() {
                    log(true, "candidate added");
                    // something happens automagically??
                  }, function(err) {
                    if(msg.candidate != null) {
                      console.error("candidate error", err, msg);
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
      // If 'update', add in the mids mapping
      // for camera, microphone, share_video, share_audio
      return new Promise(function(res, rej) {
        var all_sent = true;
        var main_room = remote.webrtc.rooms[room_id];
        if(main_room) {
          main_room.subroom_ids.forEach(function(subroom_id) {
            var rtcpc = (remote.webrtc.pc_ref('sub', subroom_id) || {}).pc;
            if(message.match(/update/)) {
              var json = null;
              try {
                json = JSON.parse(message);
              } catch(e) { }
              if(json && json.action == 'update') {
                var track_mids = {};
                json.audio_mids = [];
                json.video_mids = [];
                rtcpc.getTransceivers().forEach(function(trans, trans_idx) {
                  var mid = trans.mid;
                  var mid_fallback = trans.sender.mid_fallback;
                  if(trans.kind == 'audio' || trans.kind == 'video') { 
                    json[trans.kind + '_mids'].push(mid);
                    json[trans.kind + '_mids'].push(mid_fallback);
                  }
                  if(trans.sender && trans.sender.track && trans.sender.track.readyState != 'ended') {
                    track_mids[trans.sender.track.id] = [mid, mid_fallback];
                  }
                });
                if(json.camera) {
                  var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'video' && t.live_content && t.enabled && !t.muted && t.readyState != 'ended'});
                  if(track && track_mids[track.id]) {
                    json.camera_mids = track_mids[track.id];
                    json.video_mids.push(track_mids[track.id][0]);
                    json.video_mids.push(track_mids[track.id][1]);
                  }
                }
                if(json.microphone) {
                  var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'audio' && t.live_content && t.enabled && !t.muted && t.readyState != 'ended'});
                  if(track && track_mids[track.id]) {
                    json.microphone_mids = track_mids[track.id];
                    json.audio_mids.push(track_mids[track.id][0]);
                    json.audio_mids.push(track_mids[track.id][1]);
                  }      
                }
                if(json.sharing) {
                  var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'video' && t.share_content && t.enabled && !t.muted && t.readyState != 'ended'});
                  if(track && track_mids[track.id]) {
                    json.share_video_mids = track_mids[track.id];
                    json.video_mids.push(track_mids[track.id][0]);
                    json.video_mids.push(track_mids[track.id][1]);
                  }      
                  var track = remote.webrtc.local_tracks.find(function(t) { return t.kind == 'audio' && t.share_content && t.enabled && !t.muted && t.readyState != 'ended'});
                  if(track && track_mids[track.id]) {
                    json.share_audio_mids = track_mids[track.id];
                    json.audio_mids.push(track_mids[track.id][0]);
                    json.audio_mids.push(track_mids[track.id][1]);
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
})();

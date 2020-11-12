var remote = remote || {};
remote.webrtc2 = remote.webrtc2 || {};
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
  // "neg" being short for "negotiation"
  remote.webrtc2.neg = {
    enter_room: function(access, room_key, update) {
      // Listen
      var main_room = remote.join_room(room_key);
      main_room.subrooms = {};
      main_room.active_subrooms = function() {
        var list = [];
        for(var key in main_room.subrooms) {
          var sub = main_room.subrooms[key];
          if(key != 'latest' && sub && sub.active && ['disconnected', 'closed', 'failed'].indexOf(sub.active.pc.connectionState) == -1) {
            list.push(sub);
          }
        }
        return list;
      };
      main_room.ice = access.ice_servers;
      var room_ref = {
        id: room_key
      }
      main_room.user_added_alerts = {};
      main_room.ref = room_ref;
      main_room.status = update; // callback for status changes
      main_room.onmessage = function(msg) {
        if(msg.type == 'users') {
          remote.webrtc2.neg.ping_users(main_room, msg);
        } else if(msg.type == 'user_coming') {
          // Update status
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
          var remote_user = main_room.users[msg.author_id];
          main_room.subrooms[subroom_id] = main_room.subrooms[subroom_id] || {};
          var subroom = main_room.subrooms[subroom_id];
          main_room.subrooms.latest = subroom;
          var now = (new Date()).getTime();
          subroom.started = subroom.started || now;
          subroom.updated = now;
          subroom.main = main_room;
          subroom.id_index = subroom.id_index || 1;
          subroom.remote_user = subroom.remote_user || remote_user;
          subroom.owner_id = subroom_id.split(/::/)[1];
          if(msg.type == 'ping') {
            log(true, "received PING", subroom_id, msg);
            remote.webrtc2.neg.wait_and_answer(subroom, msg).then(null, function() {
              // handle error
            });
          } if(msg.type == 'pong') {
            // if I'm the initiator and the other user ponged me
            // saying they have no connection, I should clean up the old stuff
            log(true, "received PONG", subroom_id, msg);
            remote.webrtc2.neg.offer_and_wait(subroom, msg).then(null, function() {
              // handle error
            });
          } else if(msg.type == 'offer') {
            if(subroom.offer_received) {
              log(true, "offer received, initializing room on my side", msg.offer);
              subroom.offer_received(msg);
            }
          } else if(main_room.subrooms[subroom_id]) {
            if(msg.type == 'answer') {
              if(subroom.answer_received) {
                log(true, "answer received", msg.answer);
                subroom.answer_received(msg);
              }
            } else if(msg.type == 'candidate') {
              if(subroom.candidate_received) {
                log(true, "candidate received", msg.candidate);
                subroom.candidate_received(msg);
              }
            }
          }
        }
      };
      return main_room;
    },
    ping_users: function(main_room, msg) {
      // Update user list and ping any unconnected users
      log(true, 'USERS UPDATE', msg.list);
      main_room.raw_users = msg.list;
      var me = msg.list.find(function(u) { return u.id == main_room.user_id; });
      if(me && msg.list.indexOf(me) != -1) {
        msg.list.forEach(function(remote_user) {
          remote.webrtc2.neg.ping_user(main_room, remote_user, "not in room yet");
        });
        (main_room.pending_messages || []).forEach(function(msg) {
          main_room.onmessage(msg);
        });
        main_room.pending_messages = [];
      }
    },
    ping_user: function(main_room, remote_user, force) {
      main_room.users = main_room.users || {};
      main_room.users[remote_user.id] = main_room.users[remote_user.id] || remote_user;
      if(remote_user.id == main_room.user_id) { return; }
      if(!main_room.user_added_alerts[remote_user.id]) {
        main_room.user_added_alerts[remote_user.id] = true;
        // if(window.room && window.room.current_room && window.room.current_room.user_id && remote_user.id != window.room.current_room.user_id) {
          main_room.status({potential_partner_found: true});
        // }
        remote.user_added(main_room.ref, main_room.users[remote_user.id], false);
      }
      var remote_user_id = remote_user.id;
      var subroom_id = main_room.subroom_id(remote_user_id);
      main_room.subrooms[subroom_id] = main_room.subrooms[subroom_id] || {};
      var subroom = main_room.subrooms[subroom_id];
      subroom.main = main_room;
      subroom.id = subroom_id;
      var room_owner_id = subroom.id.split(/::/)[1];
      if(!subroom.active || force) {
        var ping = {};
        if(room_owner_id == main_room.user_id) { ping.mine = true; }
        if(!subroom.active || subroom.active.replaceable || subroom.active.pc.connectionState != 'connected' || force) { ping.renew_connection = true; }
        if(force) { ping.force_reason = force.toString(); }

        log(true, "PING to", remote_user_id, ping);
        main_room.send({
          author_id: main_room.user_id,
          target_id: remote_user_id,
          type: 'ping',
          ping: ping
        });
      }
    },
    start_connection: function(subroom, force) {
      // Each subroom can have only one active and one
      // pending connection. When the pending connection
      // goes active, kill the live one if any
      // If already connecting, assert only one listener
      // on the promise, and try reconnecting if the
      // current attempt fails
      // Attach one-time callback for offer/answer message
      // Attach candidate callback that shuts down on final candidate
      if(subroom.pending) {
        return {
          then: subroom.pending.promise.then,
          already_pending: true,
          repeat: true
        };
      } else if(!force && subroom.active && !subroom.active.replaceable && subroom.active.pc.connectionState == 'connected') {
        // Already have an active connection
        var promise = Promise.reject();
        promise.then(null, function() { });
        return {
          then: promise.then,
          already_active: true,
          repeat: true
        }
      }
      var main_room = subroom.main;
      subroom.pending = {};
      var promise = new Promise(function(resolve, reject) {
        log(true, "room has both parties", subroom);
        main_room.status({partner_negotiating: true});
        var cleaned_up = false;
        var cleanup_finished_connection = function() {
          if(cleaned_up) { return; }
          if(subroom.active && pc == subroom.active.pc) {
            subroom.active.replaceable = true;
          }
          cleaned_up = true;
          remote.webrtc2.neg.close_connection(subroom, pc);
        };
        var pc = remote.webrtc2.neg.initialize(subroom, function(state) {
          if(state == 'closed') {
            reject();
            cleanup_finished_connection();
          } else if(state == 'active') {
            resolve();
            remote.webrtc2.neg.connection_ready(subroom, pc);
            // same as 'connected' callback from previous
          }
        });
        var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
        pc_ref.cleanup = cleanup_finished_connection;
        pc_ref.allow_replacing = function() {
          if(subroom.active && pc == subroom.active.pc) {
            subroom.active.replaceable = true;
          } else if(subroom.pending && pc == subroom.pending.pc) {
            pc_ref.cleanup();
          }
        };
        subroom.pending.pc = pc;
        var handles = {send: false, receive: false};
        var check_done = function() {
          if(handles.receive && handles.send) {
            log(true, "candidate negotiation complete", subroom.id);
          }
        };
        var handle_error = function(err) {
          if(!handles.error) {
            handles.error = true;
            reject(err);
            cleanup_finished_connection();
          }
        };
        remote.webrtc2.neg.send_candidates(subroom, pc).then(function() {
          handles.send = true;
          check_done();
        }, function(err) {
          log(true, "candidate send error", err);
          handle_error(err);
        });
        remote.webrtc2.neg.wait_for_candidates(subroom, pc).then(function() {
          handles.receive = true;
          check_done();
        }, function(err) {
          log(true, "candidate receive error", err);
          handle_error(err);
        });
      });
      subroom.pending.promise = promise;
      return promise;
    },
    connection_ready: function(subroom, pc) {
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
      if(subroom.id && pc_ref.local_data_channel) {
        pc_ref.local_data_channel.subroom_id = subroom.id;
      }
      if(subroom.pending && subroom.pending.pc == pc) {
        if(subroom.active && subroom.active.pc != pc) {
          var old_active = subroom.active.pc;
          setTimeout(function() {
            old_active.close();
          }, 1000);
        }
        subroom.active = subroom.pending;
        subroom.pending = null;
      }
      var trans = pc.getTransceivers();
      var zero_type = trans[0] && trans[0].receiver && trans[0].receiver.track && trans[0].receiver.track.kind;
      zero_type = zero_type || (trans[0] && trans[0].sender && trans[0].sender.track && trans[0].sender.track.kind);
      var one_type = trans[1] && trans[1].receiver && trans[1].receiver.track && trans[1].receiver.track.kind;
      one_type = one_type || (trans[1] && trans[1].sender && trans[1].sender.track && trans[1].sender.track.kind);
      if(trans[0] && (zero_type == 'audio' || one_type != 'audio')) {
        trans[0].kind = 'audio';
        trans[0].sender.kind = 'audio';
      }
      if(trans[1] && (zero_type != 'video' || one_type == 'video')) {
        trans[1].kind = 'video';
        trans[1].sender.kind = 'video';
      }
      log("connected", pc_ref.id, subroom.remote_user.id);
      if(pc_ref.already_connected) { return; }
      pc_ref.already_connected = true;
      remote.webrtc2.failed_retries = 0;
      (subroom.to_close || []).forEach(function(ref) { if(ref) { ref.close(); } });
      subroom.to_close = null;
      delete subroom.closed;
      // we should be live!
      remote.user_added(subroom.main.ref, subroom.remote_user);
    },
    close_connection: function(subroom, pc) {
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
      log(true, "disconnected", pc_ref.id, subroom.remote_user.id);
      pc_ref.already_connected = false;
      if(pc.connectionState != 'failed' && pc.connectionState != 'disconnected' && pc.connectionState != 'closed') { 
        setTimeout(function() {
          pc.close();
        }, 500)
      }
      if(subroom.pending && subroom.pending.pc == pc) {
        subroom.pending = null;
      }
      if(subroom.active && subroom.active.pc == pc) {
        setTimeout(function() {
          if(subroom.active && subroom.active.pc == pc) {
            subroom.active = null;
          }
        }, 1000);
      }
      delete remote.webrtc2.tracks.mid_fallbacks[subroom.id];
      setTimeout(function() {
        subroom.closed = true;
        if(subroom.active && subroom.active.pc != pc && subroom.active.pc.connectionState == 'connected') {
          // Don't say user left and re-entered when just reconnecting
        } else {
          remote.user_removed(subroom.main.ref, subroom.remote_user);
        }
      }, 2000);
      var check_for_reconnect = function() {
        // If we still haven't managed a healthy connection, try again
        if(subroom.active && subroom.active.pc != pc) {

        } else if(!subroom.pending) {
          remote.webrtc2.neg.renegotiate(subroom);
        }
      };
      setTimeout(check_for_reconnect, 5000);
    },
    pc_ref: function(subroom, pc) {
      // TODO: should we try to find a more recent ref?
      // what if pc isn't active or pending???
      if(pc) {
        if(pc.ref_id && subroom.pcs[pc.ref_id]) {
          return subroom.pcs[pc.ref_id];
        } else {
          for(var key in subroom.pcs) {
            if(subroom.pcs[key] && subroom.pcs[key].pc == pc) {
              return subroom.pcs[key];
            }
          }
        }  
      } else {
        var latest = 0;
        var res = null;
        for(var key in subroom.pcs) {
          if(subroom.pcs[key] && subroom.pcs[key].started > latest) {
            res = subroom.pcs[key];
            latest = res.started;
          }
        }
        return res;
      }
      return null;
    },
    initialize: function(subroom, state_change) {
      var config = {};
      var main_room = subroom.main;
      config.iceServers = main_room.ice;
      config.iceTransportPolicy = 'all';
      config.iceCandidatePoolSize = 2;  
      var ref_id = (new Date()).getTime() + "." + Math.random();
      try {
        pc = new RTCPeerConnection(config);
        pc.ref_id = ref_id;
        pc.started = (new Date()).getTime();
      } catch(err) {
        console.error("rtcpc initialize error", err);
        remote.connection_error(main_room.ref, subroom.remote_user, 'failed');
        return null;
      }
      subroom.pcs = subroom.pcs || {};
      // Prune old connections
      remote.webrtc2.neg.prune_pcs(subroom);
      subroom.pcs[ref_id] = {
        pc: pc,
        id: ref_id,
        started: pc.started
      };
      if(subroom.owner_id == main_room.user_id) {
        remote.webrtc2.tracks.attach_data_channel(subroom, pc);
      }
      remote.webrtc2.tracks.listen_for_tracks(subroom, pc);
      remote.webrtc2.tracks.initialize_tracks(subroom, pc);
      pc.addEventListener('negotiationneeded', function(e) {
        if(pc.connectionState != 'new' && pc.connectionState != 'connecting') {
          if(subroom.active && subroom.active.pc == pc) {
            remote.webrtc2.neg.renegotiate(subroom);
          }
        }
        log(true, "needs negotiation", pc.connectionState);
      });
      pc.addEventListener('icegatheringstatechange', function(e) {
        log(true, "ice gather change", e.target.iceGatheringState);

      });
      var promise = new Promise(function(resolve, reject) {
        var connection_state = function(err) {
          if(err) {
            reject(err);
            var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
            if(pc_ref && pc_ref.cleanup) {
              setTimeout(function() {
                pc_ref.cleanup();
              }, 500);
            }
            state_change('closed')  
          } else {
            resolve(pc);
            state_change('active');
            setTimeout(function() {
              if(pc.connectionState == 'connected') {
                remote.webrtc2.has_connected = true;
              }
            }, 10000);
            setTimeout(remote.webrtc2.neg.poll_status, 15000);
          }
        };
        pc.addEventListener('connectionstatechange', function(e) {
          // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
          log(true, "state change", e.target.connectionState);
          subroom.id_index++;
          if(e.target.connectionState == 'connecting') {
            // Give up trying to connect after 15 seconds
            setTimeout(function() {
              if(e.target.connection_state == 'connecting') {
                e.target.close();
                connection_state({timeout: true});
              }
            }, 15000);
          } else if(e.target.connectionState == 'failed' || e.target.connectionState == 'disconnected' || e.target.connectionState == 'closed') { 
            if(main_room && main_room.status && !subroom.closed) { main_room.status({connection_failed: true}); }
            connection_state(e.target);
          } else if(e.target.connectionState == 'connected') {
            connection_state();
          }
        });
        pc.addEventListener('iceconnectionstatechange', function(e) {
          log(true, "ice change", e.target.iceConnectionState);
          if(e.target.connectionState === undefined && ['connected', 'disconnected', 'failed', 'closed'].indexOf(e.target.iceConnectionState) != -1) {
            if(e.target.iceConnectionState == 'failed' || e.target.iceConnectionState == 'disconnected' || e.target.iceConnectionState == 'closed') {
              connection_state(e.target);
            } else if(e.target.iceConnectionState == 'connected') {
              connection_state();
            }
          }
          if(e.target.iceConnectionState == 'checking') {
            if(main_room && main_room.status) { main_room.status({server_checking: true})}        
          } else if(e.target.iceConnectionState == 'connected') {
            if(main_room && main_room.status) { main_room.status({server_found: true})}        
          }
          // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
        });
      });
      pc.promise = promise;
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
      return pc;
    },
    is_active: function(subroom, pc) {
      var result = false;
      if(subroom.active && subroom.active.pc == pc) {
        result = true;
      } else if(!subroom.active || subroom.active.replaceable) {
        if(subroom.pending && subroom.pending.pc == pc) {
          result = true;
        }
      }
      return result;
    },
    renegotiate: function(subroom, force) {
      var main_room = subroom.main;
      var reason = "forced renegotiation";
      // If we're renegotiating already but the 
      // pending connection doesn't have the right
      // tracks, then we need to start over
      ['pending', 'active'].forEach(function(channel) {
        if(subroom[channel]) {
          if(subroom[channel].pc && remote.webrtc2.tracks.missing_tracks(subroom[channel].pc).length > 0) {
            log(true, "missing tracks on " + channel + " connection, starting negotiation over");
            force = true;
            reason = "missing tracks";
          }
        }
      });
      if(force) {
        var channel = subroom.pending || subroom.active;
        var pc_ref = remote.webrtc2.neg.pc_ref(subroom, channel && channel.pc);
        if(pc_ref && pc_ref.cleanup) {
          pc_ref.allow_replacing();
        }  

        // TODO: should we try re-offering on the active pc in this case?
        remote.webrtc2.neg.ping_user(main_room, subroom.remote_user, reason);
      }
    },
    offer_and_wait: function(subroom, msg) {
      // Send an offer and wait on the answer or timeout
      // Return a promise
      return new Promise(function(resolve, reject) {
        var force = false;
        var main_room = subroom.main;
        if(subroom.owner_id == main_room.user_id && msg.pong.renew_connection) {
          force = true;
        }
        if(subroom.owner_id == main_room.user_id) {
          if(subroom.pending) {
            log(true, "ignoring PONG because already working on a connection", subroom);
          } else {
            var promise = remote.webrtc2.neg.start_connection(subroom, force);
            if(promise.repeat) {
              if(promise.already_active) {
                log(true, "not forced an a connection is already active", promise);
              } else {
                log(true, "already waiting for an answer", promise);
              }
              reject({error: 'already offering'});
            } else {
              log(true, "creating offer", subroom);
              var pc = subroom.pending.pc;
              remote.webrtc2.tracks.initialize_tracks(subroom, pc);
              var handler = function(error) {
                if(handler.handled) { return; }
                handler.handled = true;
                if(error) {
                  var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
                  if(pc_ref && pc_ref.cleanup) { pc_ref.cleanup(); }
                  reject(error);
                } else {
                  resolve();
                }
              }
              setTimeout(function() {
                handler({timeout: true});
              }, 5000);
              pc.createOffer().then(function(desc) {
                log(true, "offer created", subroom);
                // if(rtcpc.signalingState != "stable") { console.error("initializing when NOT STABLE", rtcpc.signalingState); return; }
                pc.original_desc = desc;
                pc.setLocalDescription(desc).then(function() {
                  log(true, "offer sent", subroom);
                  main_room.send({
                    target_id: subroom.remote_user.id, 
                    author_id: main_room.user_id,
                    type: 'offer', 
                    offer: desc
                  });

                  var id = (new Date()).getTime() + "." + Math.random();
                  var pc = subroom.pending.pc;
                  subroom.answer_received = function(msg) {
                    if(subroom.answer_received.id == id) {
                      subroom.answer_received = null;
                    }
                    if(['connected', 'disconnected', 'failed', 'closed'].indexOf(pc.connectionState) != -1) { return; }
                    pc.setRemoteDescription(msg.answer).then(function() {
                      handler();
                    }, function(err) {
                      handler(err || {});
                    });
                  };  
                  subroom.answer_received.id = id;    
                }, function(err) {
                  if(err.name == 'OperationError' && err.message && err.message.match(/setLocalDescription/)) {
                    // return main_room.subrooms[subroom.id].renegotiate('bad_reuse');
                  } else if(purpose != 'no_connection') {
                    // If you're not connected anywhere, then trouble
                    // reconnecting is a last-ditch effort, and this
                    // error will unnecessarily imply connection
                    // is imminent.
                    // TODO: add logic to prevent this error when not actually connected
                    // remote.connection_error(main_room.ref, main_room.users[remote_user_id]);
                  }
                  console.error("connection description error", err, err.name, state);
                  handler(err || {});
                });
              }, function(err) {
                console.error("offer error", err, rtcpc.signalingState);
                remote.connection_error(main_room.ref, subroom.remote_user);
                handler(err || {});
              });
            }
          }  
        } else {
          log(true, "ignoring PONG because mismatched used", subroom);
        }
      });
    },
    wait_and_answer: function(subroom, msg) {
      // Wait for offer and send answer or timeout
      // Return a promise
      return new Promise(function(resolve, reject) {
        var pong = {};
        var main_room = subroom.main;
        if(subroom.owner_id == main_room.user_id) { pong.mine = true; }
        if(!subroom.active || subroom.active.replaceable || subroom.active.pc.connectionState != 'connected') { 
          pong.renew_connection = true;
          pong.force_reason = subroom.active ? (subroom.active.replaceable ? "replacing conneection" : "inactive connection") : "no active connection";
        }
        if(subroom.owner_id == main_room.user_id) {
          // send a ping instead
          remote.webrtc2.neg.ping_user(main_room, subroom.remote_user, "replying to backwards ping");
        } else {
          var force = false;
          if(msg.ping.mine && msg.ping.renew_connection) {
            force = true;
            pong.renew_connection = true;
            pong.force_reason = "responding to " + msg.ping.force_reason;
          }
          main_room.send({
            author_id: main_room.user_id,
            target_id: msg.author_id, 
            type: 'pong',
            pong: pong
          });  
          log(true, "sending PONG", subroom, pong, force);
          var promise = remote.webrtc2.neg.start_connection(subroom, force);
          if(promise.repeat) {
            if(promise.already_active) {
              log(true, "not forced an a connection is already active", promise);
            } else {
              log(true, "already waiting for an offer", promise);
            }
            reject({error: 'already waiting'});
          } else {
            var id = (new Date()).getTime() + "." + Math.random();
            var pc = subroom.pending.pc;
            var handler = function(error) {
              if(handler.handled) { return; }
              handler.handled = true;
              if(error) {
                var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
                if(pc_ref && pc_ref.cleanup) { pc_ref.cleanup(); }
                reject(error);
              } else {
                resolve();
              }
            }
            setTimeout(function() {
              handler({timeout: true});
            }, 5000);
            subroom.offer_received = function(msg) {
              if(subroom.offer_received.id == id) {
                subroom.offer_received = null;
              }
              if(['connected', 'disconnected', 'failed', 'closed'].indexOf(pc.connectionState) != -1) { return; }
              pc.setRemoteDescription(msg.offer).then(function() {
                log(true, "remote set");
                // It's at this point that the second party
                // will have all the transceivers added
                pc.createAnswer().then(function(desc) {
                  log(true, "answer created");
                  pc.setLocalDescription(desc).then(function() {
                    remote.webrtc2.tracks.initialize_tracks(subroom, pc);
                    log(true, "sending answer", desc);
                    main_room.send({
                      target_id: msg.author_id,
                      author_id: main_room.user_id,
                      type: 'answer',
                      answer: desc
                    });
                    handler();
                  }, function(err) {
                    console.error("local description error", err);
                    // TODO: err...
                    handler(err || {});
                  });
                }, function(err) {
                  console.error("answer error", err);
                  handler(err || {});
                });
              }, function(err) {
                console.error("remote decsription error", err);
                handler(err || {});
              });
            };  
            subroom.offer_received.id = id;
          }
        }
      });
    },
    send_candidates: function(subroom, pc) {
      // Send candidates as they arrive
      // Return a promise on final (empty) candidate
      return new Promise(function(resolve, reject) {
        var handled = false;
        setTimeout(function() {
          if(handled) {
            handled = true;
            reject({timeout: true});
          }
        }, 3000);
        var main_room = subroom.main;
        pc.addEventListener('icecandidate', function(e) {
          // ice candidate ready for sending
          if(e.candidate && e.candidate != '') {
            log(true, 'sending candidate', e.candidate);
            main_room.send({
              author_id: main_room.user_id,
              target_id: subroom.remote_user.id,
              type: 'candidate',
              candidate: e.candidate
            });
          } else {
            // add ice candidate to the list for sending to server
            setTimeout(function() {
              main_room.send({
                author_id: main_room.user_id,
                target_id: subroom.remote_user.id,
                type: 'candidate',
                candidate: e.candidate
              });
              log(true, "local candidate sending complete");
              resolve();  
            }, 10);
          }
        });
      });
    },
    wait_for_candidates: function(subroom, pc) {
      // Listen for candidates
      // Return a promise on final candidate
      return new Promise(function(resolve, reject) {
        var handled = false;
        setTimeout(function() {
          if(!handled) {
            handled = true;
            reject({timeout:  true});
          }
        }, 15000);
        var id = (new Date()).getTime() + "." + Math.random();
        subroom.candidate_received = function(msg) {
          var handle = function(result) {
            if(subroom.candidate_received.id == id) {
              log(true, "candidate reception complete");
              subroom.candidate_received = null;
              if(result) {
                handled = true;
                reject(result);
              } else {
                handled = true;
                resolve();
              }
            }
          };
          if(pc.connectionState == 'closed' || ['completed', 'failed', 'disconnected', 'closed'].indexOf(pc.iceConnectionState) != -1) {
            // do nothing
            handle({error: 'connection closed'});
          } else {
            if(!msg.candidate || msg.candidate == '') {
              return handle();
            }
            pc.addIceCandidate(msg.candidate || '').then(function() {
              log(true, "  candidate received & added");
            }, function(err) {
              if(!msg.candidate != null) {
                // handle(err || {});
                console.error("candidate add error", err.name, err, msg);
              }
            });  
          }
        }; 
        subroom.candidate_received.id = id; 
      });
    },
    prune_pcs: function(subroom) {
      for(var ref_id in subroom.pcs) {
        if(subroom.active && subroom.active.pc == subroom.pcs[ref_id].pc) {
        } else if(subroom.pending && subroom.pending.pc == subroom.pcs[ref_id].pc) {
        } else {
          log("pruning non-active, non-pending connection");
          if(subroom.pcs[ref_id].cleanup) {
            subroom.pcs[ref_id].cleanup();
          }
          delete subroom.pcs[ref_id];
        }                  
      }
    },
    poll_status: function() {
      // If a data track hasn't had an update in 20 seconds, assume it is broken
      // TODO: it's possible to add new data channels

      if(remote.webrtc2.neg.poll_status.timer) {
        clearTimeout(remote.webrtc2.neg.poll_status.timer);
      }
      log(true, "checking all connections");
      var all_connections_ended = true;
      var any_connections_found = false;
      var now = (new Date()).getTime();
      var room_js = window.room;
      // TODO: remote.webrtc2.tracks.track_status()
      for(var key in remote.webrtc2.rooms) {
        var room = remote.webrtc2.rooms[key];
        if(room) {
          for(var jey in room.subrooms) {
            var subroom = room.subrooms[jey];
            if(subroom) {
              remote.webrtc2.neg.prune_pcs(subroom);
      
              var needs_refresh = false;
              if(subroom.active || subroom.pending) {
                any_connections_found = true;
                if(subroom.active.pc && subroom.active.pc.connectionState == 'connected') {
                  all_connections_ended = false;
                  // For an active connection, validate all expected tracks are live
                  subroom.updated = now;
                  if(!remote.webrtc2.tracks.validate_tracks(subroom, subroom.active.pc)) {
                    log("missing expected track type");
                    needs_refresh = true;
                  } else if(subroom.last_update) {
                    if(subroom.last_update.ts < (now - (10 * 60 * 1000))) {
                      // When updates stop arriving, a connection
                      // has gone stale. The room needs a reconnection
                      // remote.webrtc2.neg.renegotiate(subroom, true);
                      log("missing active data channel");
                      needs_refresh = true;
                    } else if(subroom.last_update.ts < (now - (30 * 1000))) {
                      // If updates have only stopped recently, first try adding
                      // a new data channel to see if that helps
                      subroom.stale_data = true;
                      if((subroom.active.last_data_channel_rescue || 0) < (now - 3 * 60 * 1000)) {
                        subroom.active.last_data_channel_rescue = now;
                        remote.webrtc2.tracks.attach_data_channel(subroom, subroom.active.pc);
                      }
                    }
                  }
                } else {
                  // For a non-active connection, clean it up
                  var pc_ref = remote.webrtc2.neg.pc_ref(subroom, subroom.active.pc);
                  if(pc_ref && pc_ref.cleanup) {
                    pc_ref.allow_replacing();
                    log("no active or pending connections for", subroom.remote_user.id);
                    needs_refresh = true;
                  }
                  if(subroom.pending && subroom.pending.pc) {
                    // If there is a pending connection,
                    // mark it and sweep if it's the same 
                    // after 15 seconds
                    subroom.pending.first_pending_poll = now;
                    if(subroom.pending.first_pending_poll < (now - (15 * 1000))) {
                      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, subroom.pending.pc);
                      if(pc_ref && pc_ref.cleanup) {
                        pc_ref.cleanup();
                      }
                    }
                  }
                }
              } else if(subroom.updated && subroom.updated < (now - (10 * 60 * 1000))) {
                // Delete rooms that have been dormant more than 10 minutes
                delete room.subrooms[jey];
              }
              if(needs_refresh) {
                subroom.refresh_count = (subroom.refresh_count || 0) + 1;
                if(subroom.refresh_count < 5) {
                  log("trying to reconnect");
                  remote.webrtc2.neg.renegotiate(subroom, true);
                } else {
                  log("not retrying because too many failed attempts");
                }
              } else {
                subroom.refresh_count = 0;
              }
            }
          }
        }
      }
      if(!room.active && any_connections_found && !all_connections_ended) {
        room_js.set_active(true);
      }
      remote.webrtc2.neg.poll_status.timer = setTimeout(remote.webrtc2.neg.poll_status, 3000);
    },
    connection_type: function(main_room, user_id) {
      return new Promise(function(resolve, reject) {
        var subroom_id = main_room.subroom_id(user_id);
        var subroom = main_room.subrooms[subroom_id];
        var pc_ref = remote.webrtc2.neg.pc_ref(subroom);
        // main_room.subrooms[subroom_id].rtcpc;
        if(pc_ref && pc_ref.pc.connectionState == 'connected') {
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
    }
  };
})();
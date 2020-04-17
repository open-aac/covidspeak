var remote = remote || {};

remote.webrtc = {
  rooms: {},
  start_processsing: function(track, callback) {
    if(track.kind == 'video' || track.kind == 'audio') {
      var stream = new MediaStream();
      stream.addTrack(track);
      var elem = document.createElement(track.kind);
      elem.srcObject = stream;
      elem.onloadedmetadata = function(e) {
        callback(remote.webrtc.dom_generator(track));
      }
    } else {
      callback(null);
    }
  },
  dom_generator: function(track, stream) {
    stream = new MediaStream();
    stream.addTrack(track);  
    return function() {
      if(track.kind == 'audio') {
        var elem = document.createElement('audio');
        elem.srcObject = stream;
        elem.onloadedmetadata = function(e) {
          elem.play();
        };        
        return elem;
      } else if(track.kind == 'video') {
        var elem = document.createElement('video');
        elem.srcObject = stream;
        elem.onloadedmetadata = function(e) {
           elem.play();
        };        
        return elem;
      }
      return null;
    };
  },
  start_local_tracks: function(opts) {
    opts = opts || {audio: true, video: true, data: true};
    var init = {};
    if(opts.audio) { init.audio = {autoGainControl: true, echoCancellation: true, noiseSuppression: true}; }
    if(opts.video) { init.video = {facingMode: {ideal: 'user'}, height: 720}; }
    return new Promise(function(res, rej) {
      navigator.mediaDevices.getUserMedia(init).then(function(stream) {
        remote.webrtc.local_tracks = stream.getTracks();
        var result = [];
        remote.webrtc.local_tracks.forEach(function(track) {
          var track_ref = {
            type: track.kind,
            mediaStreamTrack: track,
            id: "0-" + track.id,
            added: (new Date()).getTime(),
          };
          if(track.kind == 'audio' || track.kind == 'video') {
            track_ref.generate_dom = remote.webrtc.dom_generator(track, stream);
          }
          result.push(track_ref);
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
            var track_ref = {
              id: "0-" + track.id,
              mediaStreamTrack: track,
              type: track.kind
            };
            if(track.kind == 'audio' || track.kind == 'video') {
              track_ref.generate_dom = remote.webrtc.dom_generator(track);
            }
            list.push(track_ref);
            var new_track = false;
            if(remote.webrtc.local_tracks.indexOf(track) == -1) {
              new_track = true;
              remote.webrtc.local_tracks.push(track);
            }
            track.enabled = true;
            if(new_track) {
              main_room.subroom_ids.forEach(function(subroom_id) {
                var pc = main_room.subrooms[subroom_id].rtcpc;
                if(pc) {
                  // pc.local_stream.addTrack(track);
                  var sender = pc.addTrack(track, pc.local_stream);
                  main_room.subrooms[subroom_id].tracks = main_room.subrooms[subroom_id].tracks || {};
                  main_room.subrooms[subroom_id].tracks[track_ref.id] = main_room.subrooms[subroom_id].tracks[track_ref.id] || {};
                  main_room.subrooms[subroom_id].tracks[track_ref.id].track = track;
                  main_room.subrooms[subroom_id].tracks[track_ref.id].sender = sender;
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
        if(track && pc) {
          track.enabled = true;
          main_room.subroom_ids.forEach(function(subroom_id) {
            var pc = main_room.subrooms[subroom_id].rtcpc;
            if(pc) {
              var sender = pc.addTrack(track, pc.local_stream);
              main_room.subrooms[subroom_id].tracks[track_ref.id].sender = sender;
              main_room.subrooms[subroom_id].tracks[track_ref.id].track = track;
              res([track_ref]);
            }
          });
        } else {
          return rej({error: 'no track or connection found'});
        }
      }
    });
  },
  remove_local_track: function(room_id, track_ref, remember) {
    return new Promise(function(res, rej) {
      var track = (remote.webrtc.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
      var main_room = remote.webrtc.rooms[room_id];

      if(track && main_room) {
        track.enabled = false;
        if(!remember) {
          main_room.subroom_ids.forEach(function(subroom_id) {
            var pc = main_room.subrooms[subroom_id].rtcpc;
            var sender = main_room.subrooms[subroom_id].tracks[track_ref.id].sender;
            if(pc && sender) {
              pc.removeTrack(sender);
            }
          });
          track.stop();
          remote.webrtc.local_tracks = (remote.webrtc.local_tracks || []).filter(function(t) { return t.id != track_ref.id; });
        }
        res(track_ref);  
      } else {
        rej({error: 'failed to unpublish'});
      }
    })
  },
  initialize: function(remote_user_id, room_id) {
    var main_room = remote.webrtc.rooms[room_id];
    if(!main_room) { return false; }
    var subroom_id = main_room.subroom_id(remote_user_id);
    var room_owner = subroom_id.split(/::/)[1];
    var initiator = main_room.user_id == room_owner;
    console.log("SETTING UP ROOM", initiator);
    main_room.subroom_ids = main_room.subroom_ids || [];
    if(main_room.subroom_ids.indexOf(subroom_id) == -1) {
      main_room.subroom_ids.push(subroom_id);
    }
    main_room.subrooms[subroom_id] = main_room.subrooms[subroom_id] || {};
    main_room.subrooms[subroom_id].id_index = 1;
    if(main_room.subrooms[subroom_id].rtcpc) {
      // keep the existing connection running until the new one is activated
      main_room.subrooms[subroom_id].data.close();
      main_room.subrooms[subroom_id].rtcpc.close();
      main_room.subrooms[subroom_id].to_close = main_room.subrooms[subroom_id].to_close || []
      main_room.subrooms[subroom_id].to_close.push(main_room.subrooms[subroom_id].data);
      main_room.subrooms[subroom_id].to_close.push(main_room.subrooms[subroom_id].rtcpc);
    }
    var config = {};
    config.iceServers = main_room.ice;
    config.iceTransportPolicy = 'all';
    config.iceCandidatePoolSize = 2;

    pc = new RTCPeerConnection(config);
    pc.local_stream = new MediaStream();
    main_room.subrooms[subroom_id].rtcpc = pc;
    var local_data = pc.createDataChannel('channel-name');
    local_data.addEventListener('open', function() {
      if(local_data.readyState == 'open') {
        // channel is live!
      }
    });
    local_data.addEventListener('close', function() {
      // channel was closed
    });
    main_room.subrooms[subroom_id].data = local_data;

    var send_offer = function() {
      pc.createOffer({  offerToReceiveAudio: 1, offerToReceiveVideo: 1}).then(function(desc) {
        if(pc.signalingState != "stable") { console.error("initializing when NOT STABLE", pc.signalingState); return; }
        pc.setLocalDescription(desc).then(function() {
          console.log("OFFER SENT");
          main_room.send({
            target_id: remote_user_id, 
            author_id: main_room.user_id,
            type: 'offer', 
            offer: desc
          });
          // TODO: re-send if things don't progress
        }, function(err) {
          // TODO: err...
        });
      }, function(err) {
        // TODO: err...
      });
    };

    pc.addEventListener('datachannel', function(e) {
      // remote data channel added
      var remote_data = event.channel;
      remote_data.addEventListener('message', function(e) {
        remote.message_received(main_room.ref, main_room.users[remote_user_id], {id: "0-" + local_data.id}, e.data);
      });
    });
    pc.addEventListener('track', function(event) {
      var track = event.track;
      var add_track = function(track) {
        var track_id = main_room.subrooms[subroom_id].id_index + "-" + track.id;
        var track_ref = {
          id: track_id,
          mediaStreamTrack: track,
          type: track.kind,
          added: (new Date()).getTime(),
        };
        if(event.streams[0] && event.streams[0] != main_room.users[remote_user_id].remote_stream) {
          main_room.users[remote_user_id].remote_stream = event.streams[0];  
        }
        remote.webrtc.start_processsing(track, function(generator) {
          track_ref.generate_dom = generator;
          remote.track_added(main_room.ref, main_room.users[remote_user_id], track_ref);
        })
        // if(track.kind == 'audio' || track.kind == 'video') {
        //   track_ref.generate_dom = remote.webrtc.dom_generator(track);
        // }
        // console.error("FIND THIS NOTE");
        // // TODO: if the track id matches an existing track,
        // // then tie its removal alert to the track_added
        // // notification of the new version
        // console.log("TRACK ADDED!", track_ref, track_id);
        // if(document.querySelector('#partner video')) {
        //   // TODO: wait until the video feed has content
        //   // before sending this notification
        //   setTimeout(function() {
        //     remote.track_added(main_room.ref, main_room.users[remote_user_id], track_ref);    
        //   }, 5000);
        // } else {

        // }
      };
      var track_id = main_room.subrooms[subroom_id].id_index + "-" + track.id;
      if(!event.streams[0]) { debugger}
      else {
        remote.webrtc.streams = (remote.webrtc.streams || []).concat(event.streams);
        // TODO: this doesn't fire on Safari
        event.streams[0].addEventListener('removetrack', function(event) {
          // TODO: if this is being replaced by a newer version,
          // then don't call track_removed here, call it
          // when the new version goes live instead
          console.log("TRACK REMOVED", event.track, track_id);
          var track = event.track;
          remote.track_removed(main_room.ref, main_room.users[remote_user_id], {
            id: track_id,
            type: track.kind
          });
        });
        // event.streams[0].addEventListener('addtrack', function(event) {
        //   add_track(event.track);
        // });
      }
      add_track(track);
    });
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/signalingState
    pc.addEventListener('icecandidate', function(e) {
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
        setTimeout(function() {
          main_room.send({
            author_id: main_room.user_id,
            target_id: remote_user_id,
            type: 'candidate',
            candidate: e.candidate
          });  
        }, 1000)        
      }
      // add ice candidate to the list for sending to server
    });
    // TODO: pc.restartIce();
    pc.addEventListener('negotiationneeded', function(e) {
      if(initiator) {
        send_offer();
      }
    });
    pc.addEventListener('connectionstatechange', function(e) {
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
      console.log("STATE CHANGE", e.target.connectionState);
      main_room.subrooms[subroom_id].id_index++;
      if(e.target.connectionState == 'failed' || e.target.connectionState == 'disconnected') { 
        main_room.already = false;
      }
      if(e.state == 'connected') {
        // (main_room.subrooms[rubroom_id].to_close || []).forEach(function(ref) { if(ref) { ref.close(); } });
        // main_room.subrooms[rubroom_id].to_close = null;
        // we should be live!
      }
    });
    pc.addEventListener('iceconnectionstatechange', function(e) {
      console.log("ICE CHANGE", e.target.iceConnectionState);
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
    });
    pc.addEventListener('icegatheringstatechange', function(e) {
      console.log("ICE GATHER CHANGE", e.target.iceGatheringState);
      if(pc.iceGatheringState != 'complete') { return; }
      // see: https://github.com/webrtc/samples/blob/59aea35498839806af937e8ce6aa99aa0bdb9e46/src/content/peerconnection/trickle-ice/js/main.js#L197

    });
    pc.addEventListener('icecandidateerror', function(e) {

    });
    remote.webrtc.local_tracks.forEach(function(track) {
      var sender = pc.addTrack(track, pc.local_stream);
      main_room.subrooms[subroom_id].tracks = main_room.subrooms[subroom_id].tracks || {};
      main_room.subrooms[subroom_id].tracks["0-" + track.id] = main_room.subrooms[subroom_id].tracks["0-" + track.id] || {};
      main_room.subrooms[subroom_id].tracks["0-" + track.id].sender = sender;
      main_room.subrooms[subroom_id].tracks["0-" + track.id].track = track;
    });
    main_room.subrooms[subroom_id].tracks["0-" + local_data.id] = main_room.subrooms[subroom_id].tracks["0-" + local_data.id] || {};
    main_room.subrooms[subroom_id].tracks["0-" + local_data.id].sender = null;
    main_room.subrooms[subroom_id].tracks["0-" + local_data.id].track = local_data;
    return pc;
  },
  connect_to_remote: function(access, room_key) {
    return new Promise(function(res, rej) {
      var main_room = remote.join_room(room_key);
      // setTimeout(function() {
      //   main_room.send({type: 'users'});
      // }, 100);
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
      main_room.ready = function() { };
      main_room.onmessage = function(msg) {
        // console.log("MESSAGE", msg);
        if(msg.type == 'users') {
          main_room.raw_users = msg.list;
          main_room.users = main_room.users || {};
          var me = msg.list.find(function(u) { return u.id == main_room.user_id; });
          if(me && msg.list.indexOf(me) != -1) {
            msg.list.forEach(function(remote_user) {
              main_room.users[remote_user.id] = main_room.users[remote_user.id] || remote_user;
              if(!main_room.user_alerts[remote_user.id]) {
                main_room.user_alerts[remote_user.id] = true;
                remote.user_added(room_ref, main_room.users[remote_user.id]);
              }
              if(remote_user.id == me.id) { return; }
              var remote_user_id = remote_user.id;
              var subroom_id = main_room.subroom_id(remote_user_id);
              var room_owner = subroom_id.split(/::/)[1];
              if(!main_room.subrooms[subroom_id]) {
                var ping = {};
                if(room_owner == main_room.user_id) { ping.mine = true; }
                if(!pc || pc.connectionState != 'connected') { ping.no_existing_connection = true; }

                main_room.send({
                  author_id: main_room.user_id,
                  target_id: remote_user_id,
                  type: 'ping',
                  ping: ping
                });
                main_room.ready = function(force) {
                  var pc = (main_room.subrooms[subroom_id] || {}).rtcpc;
                  if(!force && main_room.already && pc && pc.connectionState == 'connected') { return; }
                  main_room.already = true;
                  console.log("ROOM has both parties", subroom_id);
                  if(room_owner == main_room.user_id) {
                    var pc = remote.webrtc.initialize(remote_user_id, room_ref.id);
                  }
                };
              }
            });
          }
        } else if(msg.author_id != main_room.user_id && msg.target_id == main_room.user_id) {
          var subroom_id = main_room.subroom_id(msg.author_id);
          var pc = (main_room.subrooms[subroom_id] || {}).rtcpc;
          if(msg.type == 'ping') {
            var room_owner = subroom_id.split(/::/)[1];
            var pong = {};
            if(room_owner == main_room.user_id) { pong.mine = true; }
            if(!pc || pc.connectionState != 'connected') { pong.no_existing_connection = true; }
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
            main_room.ready(force);
          } if(msg.type == 'pong') {
            // if I'm the initiator and the other user ponged me
            // saying they have no connection, I should toss the old stuff
            var force = false;
            var room_owner = subroom_id.split(/::/)[1];
            if(room_owner == main_room.user_id && msg.pong.no_existing_connection) {
              force = true;
            }
            main_room.ready(force);
          } else if(msg.type == 'offer') {
            console.log("OFFER RECEIVED", msg.offer);
            // TODO: if(pc.signalingState == 'stable') { console.error("Received offer when stable"); }
            var pc = remote.webrtc.initialize(msg.author_id, room_ref.id);
            pc.setRemoteDescription(msg.offer).then(function() {
              console.log("REMOTE SET");
              pc.createAnswer().then(function(desc) {
                console.log("ANSWER CREATED");
                pc.setLocalDescription(desc).then(function() {
                  console.log("SENDING ANSWER", desc);
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
              console.log("ANSWER RECEIVED", msg.answer);
              pc.setRemoteDescription(msg.answer).then(function() {
                // web call should just start, yes?
              }, function(err) {

              });
            } else if(msg.type == 'candidate' && pc) {
              console.log("CANDIDATE", msg.candidate);
              pc.addIceCandidate(msg.candidate || '').then(function() {
                // something happens automagically??
              }, function(err) {
                // TODO: err...
              });
            }
          }
        }
      };
      res(room_ref);
    });
  },
  send_message: function(room_id, message) {
    return new Promise(function(res, rej) {
      var all_sent = true;
      var main_room = remote.webrtc.rooms[room_id];
      if(main_room) {
        main_room.subroom_ids.forEach(function(subroom_id) {
          var subroom = main_room.subrooms[subroom_id];
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

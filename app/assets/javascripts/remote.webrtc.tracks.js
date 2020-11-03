// TODO: falert('track last datta received and sent to aid pruning')
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
  var mid_fallbacks = {};
  remote.webrtc2.tracks = {
    attach_data_channel: function(subroom, pc) {
      return new Promise(function(resolve, reject) {
        var uid = Math.random().toString();
        var local_data = pc.createDataChannel('data-channel.' + uid);
        var check_channel = function() {
          check_channel.attempts = (check_channel.attempts || 0) + 1;
          if(check_channel.attempts > 50) {
            reject({error: 'connection timed out'});
            local_data.close();
          } else if(local_data.readyState == 'connecting') {
            setTimeout(check_channel, 200);
          } else if(local_data.readyState == 'open') {
            resolve();            
          } else if(local_data.readyState == 'closing' || local_data.readyState == 'closed') {
            reject({error: 'channel closed without opening'});
          }
        };
        var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
        if(!pc_ref) { debugger }
        pc_ref.data_channels = pc_ref.data_channels || []
        local_data.local = true;
        pc_ref.data_channels.push(local_data);
        local_data.id = local_data.id || uid;
        local_data.addEventListener('open', function() {
          // channel is live!
        });
        local_data.addEventListener('close', function() {
          // channel was closed
          if(remote.webrtc2.neg.is_active(subroom, pc)) {
            if(['disconnected', 'failed', 'closed'].indexOf(pc.connectionState) == -1) {
              log(true, "re-asserting data channel", pc.connectionState);
              remote.webrtc2.tracks.attach_data_channel(subroom, pc);
            }
          }
        });
        var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
        pc_ref.data_track_id = pc_ref.data_track_id || uid;
        pc_ref.local_tracks = pc_ref.local_tracks || {};
        pc_ref.local_tracks["0-" + pc_ref.data_track_id] = pc_ref.local_tracks["0-" + pc_ref.data_track_id] || {};
        pc_ref.local_tracks["0-" + pc_ref.data_track_id].sender = null;
        pc_ref.local_tracks["0-" + pc_ref.data_track_id].track = local_data;  
        check_channel();
      });
    },
    send_message: function(main_room, message) {
      // If 'update', add in the mids mapping
      // for camera, microphone, share_video, share_audio
      return new Promise(function(res, rej) {
        var all_sent = true;
        main_room.active_subrooms().forEach(function(subroom) {
          var rtcpc = subroom.active.pc;
          if(message.match(/update/)) {
            var json = null;
            try {
              json = JSON.parse(message);
            } catch(e) { }
            if(json && json.action == 'update') {
              json = remote.webrtc2.tracks.map_tracks(subroom, json, rtcpc);
              message = JSON.stringify(json);
            }
          }        
          if(!remote.webrtc2.tracks.send_data(subroom, message)) {
            // False return value means send failed
            all_sent = false;
          }
        });
        if(all_sent) {
          res({sent: message});
        } else {
          rej({error: "no data track found for one or more participants", message: message});
        }
      });
    },
    send_data: function(subroom, msg) {
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom);
      var remote_channel = [].concat(pc_ref.data_channels || []).reverse().find(function(c) { return c.readyState == 'open'; });
      if(remote_channel) {
        remote_channel.send(msg);
      } else if(pc_ref.pc.connectionState == 'connected') {
        log(true, "could not find an active data channel", pc_ref.pc.connectionState);
        remote.webrtc2.tracks.attach_data_channel(subroom, pc_ref.pc).then(function(data_channel) {
          data_channel.send(msg);
        }, function()  {
          log(true, "failed to start new active data channel", pc_ref.pc.connectionState);
        });
      } else {
        log(true, "no active connection on which to send data", pc_ref.pc.connectionState);
      }
    },
    listen_for_tracks: function(subroom, pc) {
      // Add track and data channel listeners
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
      pc_ref.data_track_id = pc_ref.data_track_id || Math.random().toString();
      pc_ref.data_channels = pc_ref.data_channels || [];
      var subscribe = function(data) {
        data.subroom_id = subroom.id;
        data.addEventListener('message', function(e) {
          // Ensure you're using the latest active connection for mapping tracks
          subroom.stale_data = false;
          remote.webrtc2.tracks.process_message(subroom, pc, e.data);
        });
      };
      // Listen for events on locally-created channel
      pc_ref.data_channels.forEach(function(data) {
        if(data.local && !data.subroom_id) {
          subscribe(data);
        }
      });
      pc.addEventListener('datachannel', function(event) {
        // remote data channel added
        var remote_data = event.channel;
        pc_ref.data_channels = (pc_ref.data_channels || []).filter(function(c) { return c.readyState != 'closing' && c.readyState != 'closed'});
        pc_ref.data_channels.push(remote_data);
        remote_data.addEventListener('close', function() {
          setTimeout(function() {
            if(remote.webrtc2.neg.is_active(subroom, pc)) {
              if((pc_ref.data_channels || []).filter(function(c) { return c.readyState != 'closing' && c.readyState != 'closed'}).length == 0) {
                if(['disconnected', 'failed', 'closed'].indexOf(pc.connectionState) == -1) {
                  log(true, "trying to repair lost data channel", pc.connectionState);
                  remote.webrtc2.tracks.attach_data_channel(subroom, pc);
                }
              }
            }
          }, 5000);
        });
        // Listen for events on remote-created channel
      subscribe(remote_data);
      }); 
      pc.addEventListener('track', function(event) {
        var rtcpc = (event.target && event.target.id) ? event.target : pc;
        if((event.streams || []).length > 0) {
          log(true, 'track add event', event.track.id, event.track);
          remote.webrtc2.tracks.process_track(subroom, pc, event.track, (event.streams || [])[0]);
//          main_room.add_track(event.track, (event.streams || [])[0], rtcpc.id || pc.id || pc_id);
        }
      });

    },
    mid_fallback: function(subroom, sender, value) {
      var fallbacks = mid_fallbacks[subroom.id] || [];
      var valid_senders = [].concat((subroom.active && subroom.active.pc.getSenders()) || []);
      valid_senders = valid_senders.concat((subroom.pending && subroom.pending.pc && subroom.pending.pc.getSenders()) || []);
      fallbacks = fallbacks.filter(function(f) { return valid_senders.indexOf(f.sender) != -1; });
      var match = fallbacks.find(function(f) { return f.sender == sender; });
      if(!match) {
        match = {
          sender: sender
        };
        fallbacks.push(match);
      }
      if(value) { 
        match.mid = value;
      }
      mid_fallbacks[subroom.id] = fallbacks;
      return match.mid;
    },
    process_track: function(subroom, pc, track, stream) {
      if(!track) {
        console.error("remote track add failed", track);
        return;
      }
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
      pc_ref.adding_tracks = pc_ref.adding_tracks || {};
      if(pc_ref.adding_tracks[track.id]) {
        log(true, 'already adding remote track');
        return;
      }
      pc_ref.adding_tracks[track.id] = true;
      log(true, "remote track added", track, pc_ref);
      var add_track = function(track) {
        try {
          // For now, we will ignore muted tracks as our
          // multi-transceiver approach seems to cause
          // them to arrive sometimes
          var track_ref = remote.webrtc2.track_ref(track, null, subroom.id_index);
          if(stream && subroom.remote_user && stream != subroom.remote_user.remote_stream) {
            subroom.remote_user.remote_stream = stream;
          }
          remote.webrtc2.start_processsing(track, function(generator) {
            log(true, "remote track processed", track);
            track_ref.generate_dom = generator;
            if(remote.webrtc2.neg.is_active(subroom, pc)) {
              remote.track_added(subroom.main.ref, subroom.remote_user, track_ref);
            }
            pc_ref.adding_tracks[track.id] = false;
            pc_ref.remote_tracks = pc_ref.remote_tracks || {};
            pc_ref.remote_tracks[track.id] = {ref: track_ref, track: track, pc: pc_ref.pc};
          });  
        } catch(e) {
          pc_ref.adding_tracks[track.id] = false;
          console.error("CAUGHT TRACK ADDING ERROR", e);
        };
      };
      var track_id = subroom.id_index + "-" + track.id;
      if(!stream) { debugger}
      else {
        remote.webrtc2.streams = (remote.webrtc2.streams || []).concat([stream]);
        // TODO: this doesn't fire on Safari
        if(!stream.remover_watching) {
          stream.remover_watching = true;
          stream.addEventListener('removetrack', function(event) {
            // TODO: if this is being replaced by a newer version,
            // then don't call track_removed here, call it
            // when the new version goes live instead
            log(true, "track removed due to event", event.track, track_id);
            var track = event.track;
            delete pc_ref.remote_tracks[track.id];
            setTimeout(function() {
              if(remote.webrtc2.neg.is_active(subroom, pc)) {
                remote.track_removed(subroom.main.ref, subroom.remote_user, {
                  id: track_id,
                  type: track.kind
                });  
              }
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
    },
    map_tracks: function(subroom, json, rtcpc) {
      var track_mids = {};
      json.audio_mids = [];
      json.video_mids = [];
      rtcpc.getTransceivers().forEach(function(trans, trans_idx) {
        var mid = trans.mid;
        var mid_fallback = remote.webrtc2.tracks.mid_fallback(subroom, trans.sender);
        if(trans.kind == 'audio' || trans.kind == 'video') { 
          json[trans.kind + '_mids'].push(mid);
          if(mid_fallback) {
            json[trans.kind + '_mids'].push(mid_fallback);
          }
        }
        if(trans.sender && trans.sender.track && trans.sender.track.readyState != 'ended') {
          track_mids[trans.sender.track.id] = [mid, mid_fallback];
        }
      });
      if(json.camera) {
        var track = remote.webrtc2.local_tracks.find(function(t) { return t.kind == 'video' && t.live_content && t.enabled && !t.muted && t.readyState != 'ended'});
        if(track && track_mids[track.id]) {
          json.camera_mids = track_mids[track.id];
          json.video_mids.push(track_mids[track.id][0]);
          if(track_mids[track.id][1]) {
            json.video_mids.push(track_mids[track.id][1]);
          }
        }
      }
      if(json.microphone) {
        var track = remote.webrtc2.local_tracks.find(function(t) { return t.kind == 'audio' && t.live_content && t.enabled && !t.muted && t.readyState != 'ended'});
        if(track && track_mids[track.id]) {
          json.microphone_mids = track_mids[track.id];
          json.audio_mids.push(track_mids[track.id][0]);
          if(track_mids[track.id][1]) {
            json.audio_mids.push(track_mids[track.id][1]);
          }
        }      
      }
      if(json.sharing) {
        var track = remote.webrtc2.local_tracks.find(function(t) { return t.kind == 'video' && t.share_content && t.enabled && !t.muted && t.readyState != 'ended'});
        if(track && track_mids[track.id]) {
          json.share_video_mids = track_mids[track.id];
          json.video_mids.push(track_mids[track.id][0]);
          if(track_mids[track.id][1]) {
            json.video_mids.push(track_mids[track.id][1]);
          }
        }      
        var track = remote.webrtc2.local_tracks.find(function(t) { return t.kind == 'audio' && t.share_content && t.enabled && !t.muted && t.readyState != 'ended'});
        if(track && track_mids[track.id]) {
          json.share_audio_mids = track_mids[track.id];
          json.audio_mids.push(track_mids[track.id][0]);
          if(track_mids[track.id][1]) {
            json.audio_mids.push(track_mids[track.id][1]);
          }
        }            
      }
      return json;
    },
    process_message: function(subroom, pc, data) {
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
      // log(true, 'message received', pc_ref.data_track_id, data);
      var data_pc = pc;
      if(subroom.active && subroom.active.pc != pc && subroom.active.pc.connectionState == 'connected') {
        log(true, 'message handled on different pc than received');
        data_pc = subroom.active.pc;
      } else if(subroom.pending && subroom.pending.pc != pc && subroom.pending.pc.connectionState == 'connected') {
        log(true, 'message handled on different pc than received');
        data_pc = subroom.pending.pc;
      }
      if(!remote.webrtc2.neg.is_active(subroom, pc)) {
        return;
      }

      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, data_pc);

      var json = null;
      try {
        json = JSON.parse(data);
        // If 'update', use the mid mappings to add in
        // camera_track, microphone_track, share_video_track and share_audio_track
        if(json && json.action == 'update') {
          var mid_map = {};
          data_pc.getTransceivers().forEach(function(trans) {
            var mid = trans.mid;
            var mid_fallback = remote.webrtc2.tracks.mid_fallback(subroom, trans.sender);
            if(trans.receiver && trans.receiver.track && trans.receiver.track.readyState != 'ended') {
              mid_map[mid] = trans.receiver.track;
              mid_map[mid_fallback] = trans.receiver.track;
            }
            // Trust the other side's mapping of mids,
            // only if you don't have them mapped yourself
            trans.kind = trans.kind || trans.sender.kind;
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
              json.tracks[key] = remote.webrtc2.track_ref(track, null, subroom.id_index);
            }
          });
          subroom.last_update = json;
          subroom.last_update.ts = (new Date()).getTime();
          log(true, "message", json);
          remote.message_received(subroom.main.ref, subroom.remote_user, {id: "0.i-" + pc_ref.data_track_id}, json);
          return;
        }
      } catch(e) { }
      log(true, "message", data);
      remote.message_received(subroom.main.ref, subroom.remote_user, {id: "0-" + pc_ref.data_track_id}, data);

    },
    missing_tracks: function(pc) {
      var tracks = pc.getSenders().map(function(s) { return s.track; });
      var missing = [];
      (remote.webrtc2.local_tracks || []).forEach(function(track) {
        if(tracks.indexOf(track) == -1) {
          missing.push(track);
        }
      });
      return missing;
    },
    initialize_tracks: function(subroom, pc) {
      var main_room = subroom.main;
      var initiator = subroom.owner_id == main_room.user_id;
      subroom.local_stream = new MediaStream();

      if(!pc) { return; }

      log(true, "adding initial local tracks", room.share_tracks, remote.webrtc2.local_tracks);
      var tracks_to_send = [];

      remote.webrtc2.local_tracks.forEach(function(track) {
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
        var found = remote.webrtc2.local_tracks.find(function(t) { return t == track || t.mediaStreamTrack == track; });
        if(!found) {
          console.error("PRIORITY TRACK missing from local_tracks list");
        }
      })
      log(true, "adding " + tracks_to_send.length + " local tracks", tracks_to_send);

      if(pc.getSenders().length == 0 && initiator) {
        var t = pc.addTransceiver('audio');
        t.kind = 'audio';
        t.sender.kind = 'audio';
        remote.webrtc2.tracks.mid_fallback(subroom, t.sender, 'audio0');
        t = pc.addTransceiver('video');
        t.kind = 'video';
        t.sender.kind = 'video';
        remote.webrtc2.tracks.mid_fallback(subroom, t.sender, 'video1');
        t = pc.addTransceiver('video');
        t.kind = 'video';
        t.sender.kind = 'video';
        remote.webrtc2.tracks.mid_fallback(subroom, t.sender, 'video2');
        t = pc.addTransceiver('audio');
        t.kind = 'audio';
        t.sender.kind = 'audio';
        remote.webrtc2.tracks.mid_fallback(subroom, t.sender, 'audio3');
      }

      var transceivers = pc.getTransceivers();
      var sender_map = {};
      transceivers.forEach(function(trans) {
        var kind = trans.kind || trans.sender.kind || (trans.sender.track || {}).kind || (trans.receiver.track || {}).kind;
        if(kind == 'audio') {
          if(sender_map['microphone'] || trans.mid == '3') {
            sender_map['share_audio'] = trans.sender;
            trans.target = 'share_audio';
            remote.webrtc2.tracks.mid_fallback(subroom, trans.sender, 'audio3');
          } else {
            sender_map['microphone'] = trans.sender;
            trans.target = 'microphone';
            remote.webrtc2.tracks.mid_fallback(subroom, trans.sender, 'audio0');
          }
        } else if(kind == 'video' || trans.mid == '2') {
          if(sender_map['camera']) {
            sender_map['share_video'] = trans.sender;
            trans.target = 'share_video';
            remote.webrtc2.tracks.mid_fallback(subroom, trans.sender, 'video2');
          } else {
            sender_map['camera'] = trans.sender;
            trans.target = 'camera';
            remote.webrtc2.tracks.mid_fallback(subroom, trans.sender, 'video1');
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
          if(sender.track == track) {
            log(true, "track already added at that location", remote.webrtc2.tracks.mid_fallback(subroom, sender), track);
          } else {
            log(true, "adding local track to a known location", remote.webrtc2.tracks.mid_fallback(subroom, sender), track);
            sender.replaceTrack(track);
            sender.kind = track.kind;  
          }
        } else {
          log(true, "adding local track wherever it fits", track);
          sender = pc.addTrack(track, subroom.local_stream);
          sender.kind = track.kind;
        }
        if(remote.webrtc2.tracks.mid_fallback(subroom, sender) == null) {
          remote.webrtc2.tracks.mid_fallback(subroom, sender, track.kind + track_idx.toString());
        }
        var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
        if(sender && pc_ref) {
          pc_ref.local_tracks = pc_ref.local_tracks || {};
          pc_ref.local_tracks["0-" + track.id] = pc_ref.local_tracks || {};
          pc_ref.local_tracks["0-" + track.id].sender = sender;
          pc_ref.local_tracks["0-" + track.id].track = track;  
        }
      });
    },
    add_tracks: function(main_room, stream_or_track) {
      // If the connection has an empty sender
      // an no active sender sending the current kind,
      // first try replaceTrack on the sender and only
      // if it rejects should you try adding a new track
      log(true, "adding local tracks", stream_or_track);
      return new Promise(function(res, rej) {
        var reneg = function(subroom) {
          setTimeout(function() {
            remote.webrtc2.neg.renegotiate(subroom, true);
          }, 100);
        }
        if(stream_or_track.getTracks) {
          var tracks = [];
          var stream = stream_or_track;
          // Only supports adding one audio/video track at a time
          if(stream.getVideoTracks) {
            var vid = stream.getVideoTracks()[0];
            var aud = stream.getAudioTracks()[0];
            if(vid) { tracks.push(vid); }
            if(aud) { tracks.push(aud); }
          }
          if(tracks.length > 0) {
            var list = [];
            tracks.forEach(function(track) {
              var track_ref = remote.webrtc2.track_ref(track, null, 0);
              list.push(track_ref);
              var new_track = false;
              // Check if the track is already in the list of local tracks
              if(remote.webrtc2.local_tracks.indexOf(track) == -1) {
                new_track = true;
                remote.webrtc2.local_tracks.push(track);
              }
              track.enabled = true;
              if(new_track) {
                // If this is a new track, add it to each sub-connection
                main_room.active_subrooms().forEach(function(subroom) {
                  var pc_ref = remote.webrtc2.neg.pc_ref(subroom);
                  if(pc_ref && pc_ref.pc && ['disconnected', 'failed', 'closed'].indexOf(pc_ref.pc.connectionState) == -1) {
                    var senders = pc_ref.pc.getSenders();
                    senders.forEach(function(s, idx) {
                      var fallback = null;
                      var mid_fallback = remote.webrtc2.tracks.mid_fallback(subroom, s);
                      if(mid_fallback && mid_fallback.match(/^audio/)) { fallback = 'audio'; }
                      if(mid_fallback && mid_fallback.match(/^video/)) { fallback = 'video'; }
                      s.probable_kind = s.kind || fallback;
                    });
                    var intended_sender = null;
                    var matching_senders = senders.filter(function(s, idx) { return s.probable_kind == track.kind || (s.track && s.track.kind == track.kind) || (!s.kind && !s.track && idx == (track.kind == 'audio' ? 0 : 1)); });
                    if(track.live_content) {
                      intended_sender = senders.find(function(s) { return remote.webrtc2.tracks.mid_fallback(subroom, s) == (s.probable_kind == 'audio' ? 'audio0' : 'video1'); });
                      intended_sender = intended_sender || matching_senders[0];
                    } else {
                      intended_sender = senders.find(function(s) { return remote.webrtc2.tracks.mid_fallback(subroom, s) == (s.probable_kind == 'audio' ? 'audio3' : 'video2'); });
                      intended_sender = intended_sender || matching_senders.pop();
                    }
                    if(!intended_sender) {
                      console.error("RTC: could not find sender for track", track);
                    }
                    // Check if we're already sending a track of this kind
                    senders.forEach(function(s) {
                      if(!s.track || (s.track.kind == track.kind && s.track.muted)) { intended_sender = intended_sender || s; }
                    });
                    pc_ref.local_tracks = pc_ref.local_tracks || {};
                    pc_ref.local_tracks[track_ref.id] = pc_ref.local_tracks[track_ref.id] || {};
                    pc_ref.local_tracks[track_ref.id].track = track;
                    if(intended_sender) {
                      var old_track_id = intended_sender.track && intended_sender.track.id;
                      intended_sender.replaceTrack(track).then(function() {
                        pc_ref.local_tracks[track_ref.id].sender = intended_sender;
                        if(old_track_id) {
                          remote.webrtc2.local_tracks = remote.webrtc2.local_tracks.filter(function(t) { return t.id != old_track_id; });
                        }
                        reneg(subroom);
                        // success!
                      }, function(err) {
                        // try the fallback approach
                        var sender = pc_ref.pc.addTrack(track, subroom.local_stream);
                        pc_ref.local_tracks[track_ref.id].track[track_ref.id].sender = sender;
                        reneg(subroom);
                      });
                    } else {
                      var sender = pc_ref.pc.addTrack(track, subroom.local_stream);
                      pc_ref.local_tracks[track_ref.id].track[track_ref.id].sender = sender;
                      // TODO: on the ipad it wasn't renegotiating at this point, why not???
                      reneg(subroom);
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
          var track_ref = stream_or_track;
          var track = (remote.webrtc2.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
          if(track_ref.device_id) {
            track = track || (remote.webrtc2.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
          }
          if(track) {
            track.enabled = true;
            track.muted = false;
            res([track_ref]);
            if(track.kind == 'video') {
              main_room.active_subrooms().forEach(function(subroom) {
                reneg(subroom);
              })
            }
          } else {
            return rej({error: 'no track or connection found'});
          }
        }
      });
    },
    replace_track: function(main_room, track) {
      track.kind;
      track.live_content;
      log(true, "replacing local track", track);
      return new Promise(function(res, rej) {
        if(track && main_room) {
          var track_ref = remote.webrtc2.track_ref(track, null, 0);
          var finished = 0, errors = [];
          var ended_tracks = [];
          var check_done = function(error) {
            finished++;
            if(error) {
              errors.push(error);
            }
            if(finished >= main_room.subrooms.length) {
              remote.webrtc2.local_tracks = remote.webrtc2.local_tracks || [];
              // When all subrooms are updated or errored,
              // remove the ended tracks from the list
              var nearest = remote.webrtc2.local_tracks.length;
              ended_tracks.forEach(function(t) {
                var idx = remote.webrtc2.local_tracks.indexOf(t);
                if(idx != -1) {
                  nearest = Math.min(nearest, idx);
                }
              })
              remote.webrtc2.local_tracks = remote.webrtc2.local_tracks.filter(function(t) { return ended_tracks.indexOf(t) == -1; });

              if(errors.length > 0) {
                rej(errors.length > 1 ? errors : errors[0]);
              } else {
                // Add the new track if there were no errors
                remote.webrtc2.local_tracks.splice(nearest, 0, track);
                log("successfully replaced track!");
                res({added: track_ref});
              }
            }
          };
          main_room.active_subrooms().forEach(function(subroom) {
            var pc_ref = remote.webrtc2.neg.pc_ref(subroom);
            var pc = pc_ref && pc_ref.pc;
            var sender = null;
            for(var track_id in (pc_ref.local_tracks || {})) {
              if(track_id.match(/^0-.+/)) {
                var subroom_ref = pc_ref.local_tracks[track_id];
                if(subroom_ref.sender && subroom_ref.track.kind == track.kind) {
                  sender = subroom_ref.sender;
                }
              }
            }
            if(pc && !sender) {
              var fallback_sender = null;
              pc.getSenders().forEach(function(s) {
                var mid_fallback = remote.webrtc2.tracks.mid_fallback(subroom, s);
                if(track.live_content && mid_fallback == (track.kind == 'audio' ? 'audio0' : 'video1')) {
                  sender = s;
                } else if(!track.live_content && mid_fallback == (track.kind == 'audio' ? 'audio3' : 'video2')) {
                  sender = s;
                }
                if(s.track && s.track.kind == track.kind) {
                  fallback_sender = s;
                }
              });
              if(!sender) {
                sender = sender || fallback_sender;
                console.error("had to resort to fallback lookup for sender");
              }
            }
            if(pc && sender && pc_ref) {
              var old_track = sender.track;
              sender.replaceTrack(track).then(function(res) {
                delete pc_ref.local_tracks['0-' + old_track.id];
                pc_ref.local_tracks[track_ref.id] = main_room.subrooms[subroom_id][pc.id].tracks[track_ref.id] || {};
                pc_ref.local_tracks[track_ref.id].track = track;
                pc_ref.local_tracks[track_ref.id].sender = sender;
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
    remove_track: function(main_room, track_ref, remember) {
      log("removing local track", track_ref);
      if(!track_ref) { debugger }
      return new Promise(function(res, rej) {
        var track = (remote.webrtc2.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
        if(track_ref.device_id) {
          track = track || (remote.webrtc2.local_tracks || []).find(function(t) { return t.getSettings().deviceId == track_ref.device_id; });
        }
        if(!track) {
          // fallback for unexpected removal
          main_room.active_subrooms().forEach(function(subroom) {
            var pc = (remote.webrtc2.neg.pc_ref(subroom) || {}).pc;
            if(!track && pc) {
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
            remote.webrtc2.local_tracks = (remote.webrtc2.local_tracks || []).filter(function(t) { return t.id != track.id; });
            main_room.active_subrooms().forEach(function(subroom) {
              var pc_ref = remote.webrtc2.neg.pc_ref(subroom);
              var pc = pc_ref && pc_ref.pc;
              var sender = pc_ref && track_ref && (pc_ref.local_tracks[track_ref.id] || {}).sender;
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
                // setTimeout(function() {
                  if(pc.connectionState == 'connected') {
                    pc.removeTrack(sender);
                  }
                  delete pc_ref.local_tracks[track_ref.id];
                  setTimeout(function() {
                    // remote.webrtc2.neg.renegotiate(subroom);  
                  }, 100);
                // }, 100);
              }
            });
            track.stop();
          }
          res(track_ref);  
        } else {
          rej({error: 'failed to unpublish'});
        }
      });
    },
    validate_tracks: function(subroom, pc) {
      var pc_ref = remote.webrtc2.neg.pc_ref(subroom, pc);
      var valid = true;
      if(pc_ref && pc_ref.pc && pc_ref.pc.connectionState != 'disconnected' && pc_ref.pc.connectionState != 'closed' && pc_ref.pc.connectionState != 'failed' && !subroom.stale_data) {
        if(pc_ref.pc.connectionState == 'connected') {
          // Sometimes we get in a state where we think we're
          // connected, but nothing is showing. There is
          // a deeper issue but this should patch it...
          var receivers = pc_ref.pc.getReceivers();
          var senders = pc_ref.pc.getSenders();
          var video_muted = true;
          var track_ids = (room.local_tracks || []).map(function(t) { return t.id; }).join('+');
          subroom.local_issue_ids = subroom.local_issue_ids || {};
          if((room.local_tracks || []).find(function(t) { return t.type == 'video' && t.mediaStreamTrack && t.mediaStreamTrack.enabled && !t.mediaStreamTrack.muted; })) {
            video_muted = false;
          }
          if(!video_muted && !senders.find(function(r) { return r.track && r.track.kind == 'video' && r.track.enabled && !r.track.muted; })) {
            console.error("Expected to be sending local video but none attached to the stream");
            if(!subroom.local_issue_ids[track_ids]) {
              valid = false;
              subroom.local_issue_ids[track_ids] = true;
            }
          }
          if(!room.mute_audio && !senders.find(function(r) { return r.track && r.track.kind == 'audio' && r.track.enabled && !r.track.muted; })) {
            console.error("Expected to be sending local audio but none attached to the stream");
            if(!subroom.local_issue_ids[track_ids]) {
              valid = false;
              subroom.local_issue_ids[track_ids] = true;
            }  
          }

          room.state_for = room.state_for || {};
          subroom.remote_issue_ids = subroom.remote_issue_ids || {};
          if(room.state_for[pc_ref.user_id] && room.state_for[pc_ref.user_id].video) {
            var vidrec = receivers.find(function(r) { return r.track && r.track.kind == 'video' && r.track.enabled && r.track.readyState != 'ended'; });
            if(!vidrec || vidrec.track.muted) {
              // NOTE: video seems to get muted temporarily on iOS
              console.error(vidrec.track.muted ? "Remote video found, but unexpetedly muted" : "Expected to receive remote video but none found");
              if(!subroom.remote_issue_ids[room.state_for.track_ids]) {
                valid = false;
                subroom.remote_issue_ids[room.state_for.track_ids] = true;
              }
            }
          }
          if(room.state_for[pc_ref.user_id] && room.state_for[pc_ref.user_id].audio) {
            if(!receivers.find(function(r) { return r.track && r.track.kind == 'audio' && r.track.enabled && !r.track.muted && r.track.readyState != 'ended'; })) {
              console.error("Expected to receive remote audio but none found");
              if(!subroom.remote_issue_ids[room.state_for.track_ids]) {
                valid = false;
                subroom.remote_issue_ids[room.state_for.track_ids] = true;
              }
            }
          }
          if(valid && subroom.started < (new Date()).getTime() - (30 * 1000)) {
            // If we have sustained a connection for at
            // least 30 second and it's not missing
            // anything, clear issue_ids;
            subroom.local_issue_ids = {};
            subroom.remote_issue_ids = {};
          }
        }
      }
      return valid;
    },
    refresh_tracks: function(main_room) {
      if(main_room && main_room.subrooms) {
        main_room.active_subrooms().forEach(function(subroom) {
          var last_update = subroom.last_update;
          var active_mids = {};
          if(last_update) {
            ['camera', 'microphone', 'share_video', 'share_audio'].forEach(function(key) {
              var check = key.match(/share/) ? 'sharing' : key;
              if(last_update[check] && last_update[key + '_mids']) {
                last_update[key + '_mids'].forEach(function(mid) {
                  active_mids[mid] = true;
                });
              }  
            });
          }
          var pc_ref = remote.webrtc2.neg.pc_ref(subroom);
          if(pc_ref && pc_ref.pc) {
            pc_ref.pc.getTransceivers().forEach(function(trans) {
              var rec = trans.receiver;
              if(!active_mids[trans.mid]) {
                // log(true, "found a disabled track");
              } else if(rec.track && rec.track.readyState != 'ended' && rec.track.enabled) {
                // Track is active, now check that it's not already been added
                pc_ref.remote_tracks = pc_ref.remote_tracks || {};
                if(!pc_ref.remote_tracks[rec.track.id]) {
                  var track = rec.track;
                  pc_ref.adding_tracks = pc_ref.adding_tracks || {};
                  if(!pc_ref.adding_tracks[track.id]) {
                    pc_ref.adding_tracks[track.id] = true;
                    var stream = new MediaStream();
                    console.error("MISSED A TRACK! adding now...", trans.mid, track.id, track);
                    stream.addTrack(track);
                    remote.webrtc2.tracks.process_track(subroom, pc_ref.pc, track, stream);
                  }
                } else {
                  log(true, "found a known track");
                }
              }
            });
          }
        });
      }
    }
  };
  remote.webrtc2.tracks.mid_fallbacks = mid_fallbacks;
})();

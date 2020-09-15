// TODO: fix this... doesn't connect correctly
// Also it needs to discern between live_content
// and shared feeds, maybe using SID?
// https://media.twiliocdn.com/sdk/js/video/releases/2.0.0/docs/Track.html
var remote = remote || {};
remote.twilio = {
  start_local_tracks: function(opts) {
    return new Promise(function(res, rej) {
      var local_track = new Twilio.Video.LocalDataTrack();
      remote.twilio.data_track = local_track;
      Twilio.Video.createLocalTracks(opts).then(function(tracks) {
        if(opts.data) {
          tracks.push(local_track);
        }
        remote.twilio.local_tracks = tracks;
        var result = [];
        tracks.forEach(function(track) {
          var device_id = track.name;
          if(track.mediaStreamTrack && track.mediaStreamTrack.getSettings) {
            device_id = track.mediaStreamTrack.getSettings().deviceId;
          }
          result.push({
            type: track.kind,
            id: track.name,
            added: (new Date()).getTime(),
            mediaStreamTrack: track.mediaStreamTrack,
            device_id: device_id,
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
          // TODO: include the root audio track as well
        }
        if(tracks.length > 0 && participant) {
          participant.publishTracks(tracks).then(function(local_track_pubs) {
            var list = [];
            local_track_pubs.forEach(function(local_track_pub) {
              remote.twilio.local_tracks.push(local_track_pub.track);
              var device_id = local_track_pub.name;
              if(local_track_pub.track.mediaStreamTrack && local_track_pub.track.mediaStreamTrack.getSettings) {
                device_id = local_track_pub.track.mediaStreamTrack.getSettings().deviceId;
              }
              track_ref = {
                type: local_track_pub.track.kind,
                id: local_track_pub.track.name,
                mediaStreamTrack: local_track_pub.track.mediaStreamTrack,
                device_id: device_id,
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
        if(track_ref.device_id) {
          track = track || (remote.twilio.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
        }
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
      if(track_ref.device_id) {
        track = track || (remote.twilio.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
      }
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
  reconnect: function() {
    // TODO: not implemented
  },
  connect_to_remote: function(access, room_key) {
    return new Promise(function(res, rej) {
      Twilio.Video.connect(access.token, { name:room_key, tracks: remote.twilio.local_tracks }).then(function(room) {
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
            var device_id = track.name;
            if(track.mediaStreamTrack && track.mediaStreamTrack.getSettings) {
              device_id = track.mediaStreamTrack.getSettings().deviceId;
            }
            var track_ref = {
              type: track.kind,
              id: track.name,
              mediaStreamTrack: track.mediaStreamTrack,
              device_id: device_id,
              generate_dom: track.attach ? function() { return track.attach(); } : null
            };
            // TODO: can we figure out the video dimensions here?
            remote.track_added(room_ref, participant_ref, track_ref);
            track.on('message', function(data) {
              // If 'update', use the SIDs mappings to add in
              // camera_track, microphone_track, share_video_track and share_audio_track
              remote.message_received(room_ref, participant_ref, track_ref, data);
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
            var device_id = track.name;
            if(track.mediaStreamTrack && track.mediaStreamTrack.getSettings) {
              device_id = track.mediaStreamTrack.getSettings().deviceId;
            }
            var track_ref = {
              type: track.kind,
              device_id: device_id,
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
        room.on('participantDisconnected', function(participant) {
          console.log("A remote Participant disconnected: " + participant);
          var participant_ref = {
            id: participant.identity
          };
          remote.user_removed(room_ref, participant_ref);
        });  
      }, function(err) {
        rej(err);
      });
    });
  },
  send_message: function(room_id, message) {
    // If 'update', add in the SIDs mapping
    // for camera, microphone, share_video, share_audio
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
var remote = remote || {};
// TODO: some way to add pause, resume, go back, skip
remote.video = {
  rooms: {},
  start_processsing: function(track, fake_remote, callback) {
    if(track.kind == 'video' || track.kind == 'audio') {
      var stream = new MediaStream();
      stream.addTrack(track);
      var elem = document.createElement(track.kind);
      elem.srcObject = stream;
      elem.onloadedmetadata = function(e) {
        var generator = remote.mirror.dom_generator(track, null, fake_remote)
        callback(generator);
      }
    } else {
      callback(null);
    }
  },
  start_local_tracks: function(opts) {
    return new Promise(function(res, rej) {
      // delay before returning placeholder tracks, 
      // but immediately request actual tracks, and 
      // add them once connected if things go smoothly
      var canvas_elem = document.createElement('canvas');
      // TODO: repeatedly draw "no video" icon until the element is replaced;
      var stream = canvas_elem.captureStream();
      remote.video.canvas_stream = stream;
      var video = stream.getVideoTracks()[0];
      var audio = null;
      if(window.AudioContext || window.webkitAudioContext) { // if I'm the communicator, analyze, otherwise it should only add for communicator
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        var ac = new AudioContext();
        if(ac.createMediaStreamDestination) {
          var dest = ac.createMediaStreamDestination();
          audio = dest.stream.getAudioTracks()[0];  
        }
      }
      var starting_stream = new MediaStream();
      if(audio) { starting_stream.addTrack(audio); }
      if(video) { starting_stream.addTrack(video); }
      setTimeout(function() {
        starting_stream.returned = true;
        remote.video.local_tracks = starting_stream.getTracks();
        var result = [];
        remote.video.local_tracks.forEach(function(track) {
          var track_ref = {
            type: track.kind,
            mediaStreamTrack: track,
            id: "0-" + track.id,
            device_id: track.getSettings().deviceId,
            added: (new Date()).getTime(),
          };
          if(track.kind == 'audio' || track.kind == 'video') {
            track_ref.generate_dom = remote.mirror.dom_generator(track, stream);
          }
          result.push(track_ref);
        });
        res(result);
      }, 500);
          
      input.request_media(opts).then(function(stream) {
        if(!starting_stream.returned) {
          starting_stream = stream;
        } else {
          var tracks = stream.getTracks().map(function(track) {
            return {
              type: track.kind,
              mediaStreamTrack: track,
              id: "0-" + track.id,
              device_id: track.getSettings().deviceId,
              added: (new Date()).getTime(),
              generate_dom: remote.mirror.dom_generator(track, stream)
            }
          });
          room.local_tracks = tracks;
          remote.local_tracks = tracks;
          remote.video.local_tracks = tracks;
          room.update_preview();
        }
      }, function(err) {
      })
    });
  },
  add_local_tracks: function(room_id, stream_or_track) {
    var track_ref = stream_or_track;
    var main_room = remote.video.rooms[room_id];
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
              device_id: track.getSettings().deviceId,
              type: track.kind
            };
            if(track.kind == 'audio' || track.kind == 'video') {
              track_ref.generate_dom = remote.mirror.dom_generator(track);
            }
            list.push(track_ref);
            var new_track = false;
            if(remote.video.local_tracks.indexOf(track) == -1) {
              new_track = true;
              remote.video.local_tracks.push(track);
            }
            track.enabled = true;
          });
          res(list);
        } else {
          return rej({error: 'no track or connection found'});
        }
      } else {
        var track = (remote.video.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
        if(track_ref.device_id) {
          track = track || (remote.video.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
        }
        if(track && pc) {
          track.enabled = true;
          res([track_ref]);
        } else {
          return rej({error: 'no track or connection found'});
        }
      }
    });
  },
  remove_local_track: function(room_id, track_ref, remember) {
    return new Promise(function(res, rej) {
      var track = (remote.video.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
      if(track_ref.device_id) {
        track = track || (remote.video.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
      }
      var main_room = remote.video.rooms[room_id];

      if(track && main_room) {
        track.enabled = false;
        if(!remember) {
          track.stop();
          remote.video.local_tracks = (remote.video.local_tracks || []).filter(function(t) { return t.id != track_ref.id.replace(/^\d+-/, ''); });
        }
        res(track_ref);  
      } else {
        rej({error: 'failed to unpublish'});
      }
    })
  },
  reconnect: function() {
    // noop
  },
  connect_to_remote: function(access, room_key) {
    return new Promise(function(res, rej) {
      var main_room = remote.video.rooms[room_key] || {};
      
      remote.video.rooms = remote.video.rooms || {};
      remote.video.rooms[room_key] = main_room;

      var room_ref = {
        id: room_key
      }
      main_room.ref = room_ref;
      var pre_video = document.createElement('video');
      var video_url = (location.hash || "").substring(1)
      if(video_url && video_url.match(/^http/)) {
        remote.video.timings[video_url] = {en: []};
      } else {
        video_url = remote.video.url;
      }
      remote.video.current_url = video_url;
      pre_video.src = video_url;
      pre_video.addEventListener('canplay', function(e) {
        console.log("VIDEO READY");
        res(room_ref);
        pre_video.begin = function(track_ref) {
          remote.user_added(main_room.ref, main_room.remote_user_ref);
          remote.track_added(main_room.ref, main_room.remote_user_ref, track_ref);
        };
      });
      pre_video.addEventListener('error', function(e) {
        rej(e);
      });
      pre_video.addEventListener('abort', function(e) {
        rej(e);
      });
      pre_video.load();
      setTimeout(function() {
        main_room.remote_user_ref = {
          id: 'teach-video'
        };
        var track_ref = {
          id: 'video-feed',
          mediaStreamTrack: remote.video.canvas_stream.getVideoTracks()[0],
          device_id: 'video-teach',
          type: 'video',
          added: (new Date()).getTime()
        };
        var starting = function(track_ref) {
          if(pre_video.begin) {
            pre_video.begin(track_ref);
          } else {
            setTimeout(function() {
              starting(track_ref);
            }, 100);
          }
        };
        track_ref.generate_dom = function() {
          if(!room.active) {
            room.status("Loading Video...");
          }
          var video = document.createElement('video');
          video.src = video_url;
          if(video_url != remote.video.url) {
            video.loop = true;
          }
          video.controls = false;
          video.addEventListener('canplay', function(e) {
            console.log("DOM VIDEO READY");
            room.status("ready");
            remote.video.video_room_id = main_room.ref.id;
            remote.video.track_video(video);
            var show_controls = function() {
              if(video_url == remote.video.url) {
                var elem = document.querySelector('#video_controls');
                elem.style.display = 'block';
                var rect = document.querySelector('.col.right').getBoundingClientRect();
                elem.style.right = (rect.width) + "px";
                elem.style.left = 'unset';
                document.querySelector('#text').classList.add('slide_down');
                setTimeout(function() {
                  elem.style.opacity = 1.0;
                }, 500);
              }
            };
            video.play().then(function() {
              setTimeout(show_controls, 5000);
            }, function(err) {
              show_controls();
            });
          });
          video.load();
          return video;
        };
        starting(track_ref);
      }, 200);
      
    });
  },
  track_video: function(video) {
    if(video) {
      remote.video.video_elem = video;
      (remote.video.timings[remote.video.current_url]['en'] || []).forEach(function(timing) {
        timing.handled = false;
      });
    }
    video = remote.video.video_elem;
    if(video.paused) {
      document.querySelector('#video_controls .play').style.display = 'inline';
      document.querySelector('#video_controls .pause').style.display = 'none';
    } else {
      document.querySelector('#video_controls .play').style.display = 'none';
      document.querySelector('#video_controls .pause').style.display = 'inline';
    }
    var time = video.currentTime;
    var min = Math.floor(Math.round(time) / 60);
    var sec = Math.round(time) % 60;
    document.querySelector('#video_controls .running').innerText = (min || '0') + ":" + sec.toString().padStart(2, '0');
    var main_room = remote.video.rooms[remote.video.video_room_id];
    (remote.video.timings[remote.video.current_url]['en'] || []).forEach(function(timing) {
      var cont = function() {
        if(!cont.continued) {
          cont.continued = true;
          room.status();
          remote.video.message_callback = null;
          video.play();
        }
      }
      if(time > (timing.time - 0.5) && time < (timing.time + 0.5) && !timing.handled) {
        timing.handled = true;
        if(timing.action == 'pause') {
          video.pause();
          room.status("Waiting...", {continue: true, callback: function() {
            cont();
          }});
          setTimeout(function() {
            cont();
          }, 15000);
        } else if(timing.action == 'wait') {
          video.pause();
          remote.video.message_callback = function(msg) {
            if(timing.check(msg)) {
              cont();
            }
          };
          setTimeout(cont, 30000);
        } else if(timing.action == 'send') {
          if(timing.message.action == 'update' && timing.message.asserted_buttons) {
            timing.message.asserted_buttons.set_at = (new Date()).getTime();
          }
          if(timing.message.action == 'update' && timing.message.keyboard_state) {
            timing.message.keyboard_state.set_at = (new Date()).getTime();
          }
          timing.message.timestamp = (new Date()).getTime();
          var msg = JSON.stringify(timing.message);
          remote.message_received(main_room.ref, main_room.remote_user_ref, {id: 'remote-data'}, msg);
        } else if(timing.action == 'load') {
          var grid = boards.grids.find(function(g) { return g.id == timing.id; });
          if(grid) {
            room.assert_grid(grid.buttons, grid.id, grid.locale, false);
          }
        }
      }
    });
    setTimeout(remote.video.track_video, 200);
  },
  recent_messages: function(room_id) {

  },
  jump: function(action) {
    if(!remote.video.video_elem) { return; }
    var chapters = (remote.video.timings[remote.video.current_url]['en'] || []).filter(function(t) { return t.action == 'chapter'; });
    if(action == 'back') {
      var chapter = chapters.filter(function(t) { return t.time < remote.video.video_elem.currentTime - 3; }).pop();
      if(chapter) {
        remote.video.video_elem.currentTime = chapter.time;
      } else {
        remote.video.video_elem.currentTime = 0;
      }
    } else if(action == 'forward') {
      var chapter = chapters.find(function(t) { return t.time > remote.video.video_elem.currentTime; })
      if(chapter) {
        remote.video.video_elem.currentTime = chapter.time;
      }
    } else if(action == 'pause') {
      remote.video.video_elem.pause();
    } else if(action == 'play') {
      remote.video.video_elem.play();      
    }
  },
  send_message: function(room_id, message) {
    var json = null;
    try {
      json = JSON.parse(message);
    } catch(e) { }
    var main_room = remote.video.rooms[room_id];
    return new Promise(function(res, rej) {
      if(!json) {
        rej({error: 'invalid message'});
      } else if(main_room && main_room.remote_user_ref) {
        main_room.sent_messages = main_room.sent_messages || [];
        main_room.sent_messages.push(message);
        if(remote.video.message_callback) {
          remote.video.message_callback(json);
        }
        res({sent: message});    
      } else {
        rej({error: 'user not yet wired up'});
      }
    });
  }


  


};
// https://d18vdu4p71yql0.cloudfront.net/Puppet.mp4
remote.video.url = "https://d18vdu4p71yql0.cloudfront.net/covidspeak.mp4";
remote.video.timings = {};
remote.video.timings[remote.video.url] = {}
remote.video.timings[remote.video.url]['en'] = [
  {time: (0 * 60) + 24, action: 'chapter'},
  {time: (0 * 60) + 54, action: 'chapter'},
  {time: (1 * 60) + 24, action: 'chapter'},
  {time: (2 * 60) + 40.3, action: 'chapter'},
  {time: (3 * 60) + 48.3, action: 'chapter'},
  {time: (4 * 60) + 29, action: 'chapter'},
  {time: (5 * 60) + 36.7, action: 'chapter'},
  {time: (6 * 60) + 3, action: 'chapter'},
  {time: (6 * 60) + 43, action: 'chapter'},
  {time: (7 * 60) + 3, action: 'chapter'},
  {time: 53, action: 'pause'},
  {time: (1 * 60) + 10, action: 'load', id: 'quick'},
  {time: (1 * 60) + 12, action: 'send', message: {action: 'click', button: {id: 1}}},
  {time: (1 * 60) + 22.5, action: 'wait', check: function(msg) { return msg && msg.action == 'click'; }},
  {time: (2 * 60) + 20, action: 'short_pause'},
  {time: (2 * 60) + 50, action: 'load', id: 'quick'},
  {time: (2 * 60) + 51, action: 'wait', check: function(msg) { return msg && msg.action == 'click' && msg.button.id == 3}},
  {time: (2 * 60) + 58, action: 'wait', check: function(msg) { return msg && msg.action == 'click' && msg.button.id == 4}},
  {time: (3 * 60) + 30 + 27, action: 'load', id: 'requests'},
  {time: (3 * 60) + 42 + 26, action: 'wait', check: function(msg) { return msg && msg.action == 'update' && msg.asserted_buttons && msg.asserted_buttons.grid_id != 'requests'; }},
  {time: (4 * 60) + 6 + 26, action: 'send', message: {
    action: 'update', 
    user_id: 'teach-video', 
    audio: true,
    video: true,
    asserted_buttons: {
      grid_id: 'custom_video', 
      root_id: 'custom_video', 
      buttons: [
        {id: 1, text: "Nice"}, 
        {id: 2, text: "Start Over"}, 
        {id: 3, text: "Cool"}, 
        {id: 4, text: "Left"},
        {id: 5, text: "Right"}, 
        {id: 6, text: "Flower"}, 
        {id: 7, text: "Car"}, 
        {id: 8, text: "Rainbow"}
      ]
    }
  }},
  {time: (4 * 60) + 34 + 26, action: 'wait', check: function(msg) { return msg && msg.action == 'update' && msg.asserted_buttons && msg.asserted_buttons.grid_id != 'custom_video' && msg.asserted_buttons.grid_id.match(/^custom/); }},
  {time: (4 * 60) + 56 + 26 + 21.5, action: 'send', message: {from_communicator: true, action: 'image', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f973.svg', text: 'party'}},
  {time: (5 * 60) + 4 + 26 + 22.5, action: 'wait', check: function(msg) { return msg && msg.action == 'image'; }},
  {time: (5 * 60) + 55 + 26 + 21.5, action: 'pause'},
  {time: (5 * 60) + 58 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: "f"
    }
  }},
  {time: (5 * 60) + 59 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: "fri"
    }
  }},
  {time: (6 * 60) + 0 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: "friend"
    }
  }},
  {time: (6 * 60) + 1 + 26 + 22.5, action: 'load', id: 'keyboard'},
  {time: (6 * 60) + 2 + 26 + 22, action: 'send', message: {action: 'click', button: {id: 8}}},
  {time: (6 * 60) + 5 + 26 + 22.5, action: 'load', id: 'keyboard6'},
  {time: (6 * 60) + 6 + 26 + 22.5, action: 'send', message: {action: 'click', button: {id: 8}}},
  {time: (6 * 60) + 6.1 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: "friends"
    }
  }},
  {time: (6 * 60) + 9 + 26 + 22.5, action: 'load', id: 'keyboard'},
  {time: (6 * 60) + 12 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: ""
    }
  }},
  {time: (6 * 60) + 14 + 26 + 22.5, action: 'load', id: 'quick'},
  {time: (6 * 60) + 17 + 26 + 22.5, action: 'send', message: {from_communicator: true, action: 'image', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg', text: 'clapping'}},
  {time: (6 * 60) + 17.5 + 26 + 22.5, action: 'send', message: {from_communicator: true, action: 'image', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg', text: 'clapping'}},
  {time: (6 * 60) + 18 + 26 + 22.5, action: 'send', message: {from_communicator: true, action: 'image', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg', text: 'clapping'}},
  {time: (6 * 60) + 25 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: "Thank you!"
    }
  }},
  {time: (6 * 60) + 35 + 26 + 22.5, action: 'send', message: {
    action: "update",
    user_id: "teach-video",
    audio: true,
    video: true,
    keyboard_state: {
      string: ""
    }
  }}
];

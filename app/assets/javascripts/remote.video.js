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
      var audio = stream.getAudioTracks()[0];
      var ac = new AudioContext();
      var dest = ac.createMediaStreamDestination();
      var video = dest.stream.getVideoTracks()[0];
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
          remote.video.replace_local_tracks = stream.getTracks();
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
      var video = document.createElement('video');
      video.src = "https://d18vdu4p71yql0.cloudfront.net/covidspeak.mp4";
      video.addEventListener('canplay', function(e) {
        res(room_ref);
      });
      video.addEventListener('error', function(e) {
        rej(e);
      });
      setTimeout(function() {
        main_room.remote_user_ref = {
          id: 'teach-video'
        };
        remote.user_added(main_room.ref, main_room.remote_user_ref);
        var track_ref = {
          id: 'video-feed',
          mediaStreamTrack: remote.video.canvas_stream.getVideoTracks()[0],
          device_id: 'video-teach',
          type: 'video',
          added: (new Date()).getTime()
        };
        track_ref.generate_dom = function() {
          var video = document.createElement('video');
          video.src = "https://d18vdu4p71yql0.cloudfront.net/covidspeak.mp4";
          video.controls = false;
          video.onloadedmetadata = function(e) {
            remote.video.video_room_id = main_room.ref.id;
            remote.video.track_video(video);
            video.play();
            setTimeout(function() {
              var elem = document.querySelector('#video_controls');
              elem.style.display = 'block';
              var rect = document.querySelector('.col.right').getBoundingClientRect();
              elem.style.right = (rect.width) + "px";
              elem.style.left = 'unset';
              document.querySelector('#text').classList.add('slide_down');
              setTimeout(function() {
                elem.style.opacity = 1.0;
              }, 500);
            }, 5000);
          };  
          return video;
        };
        remote.track_added(main_room.ref, main_room.remote_user_ref, track_ref);
      }, 200);
      
    });
  },
  track_video: function(video) {
    if(video) {
      remote.video.video_elem = video;
      remote.video.timings['en'].forEach(function(timing) {
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
    remote.video.timings['en'].forEach(function(timing) {
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
            room.assert_grid(grid.buttons, grid.id, false);
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
    var chapters = remote.video.timings['en'].filter(function(t) { return t.action == 'chapter'; });
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
remote.video.timings = {};
remote.video.timings['en'] = [
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
// TODO: need to include note about how buttons are flipped

/*
 Script:
 Hi! My name Brian, and Welcome to Co-VidSpeak! 
 This is an app you can
 use to communicate remotely with someone who may not
 be able to speak. I'm going to walk you through some
 of the basic features of Co-VidSpeak so you can feel
 more comfortable using it. You can watch this video 
 any time by using "teach" as the join code for starting
 a room. Whenever you want to be done just hit "more" 
 and then "end" to leave this room.

 Co-VidSpeak is basically just a two-way video call
 with some options in a frame around the video feed.
 You should see right now a video of my happy friendly
 face, as well as a preview of your own video feed.
 If your video isn't showing up, you may need to check
 your permissions for your device to make sure you're
 letting it share your video feed. If the wrong camera
 is showing you can change your preferred camera by
 hitting "More" and then "Settings". I'll give you a moment
 in case you need to do that now. Just hit "I'm Ready"
 when you want to continue. [wait for ready]
 
 All right, here we go.
 If someone can't speak, they can use their eyes or hit
 these buttons to send them to the other person. Co-VidSpeak
 isn't just a video call, it also has buttons surrounding
 the video that we can use. For example, I can 
 hit "hi" [send] and it will highlight for
 you. You can also hit buttons and they will highlight
 for me so I can see what you're selecting. Go ahead and
 try hitting a button to send a message to me. 
 [wait for any button message]

 Great! That works if we can both hit buttons, but there
 are times when I may not be able to use my hands. In that
 case I can gesture using my eyes to tell you which button
 I'm thinking of, and you can hit it for me. Eye gestures
 will work best if my video feed is lined up correctly.
 If you tap or click the screen you should see a dotted
 line appear, which you can use the line up my video feed.
 Use the plus and minus icons to zoom and out to help
 you get a good of me eyes and to get my feed lined up 
 well for eye gestures. I'll give you a moment to play 
 with that. [wait for ready]
 
 Ready? Now let's practice talking using eye gestures.
 I'll look at one of the buttons, [assert default grid]
 and you see if you can
 tell which button I'm gesturing towards. 
 [wait for specific button message]

 Awesome. Remember to hit the button when you can tell
 what the other person is gesturing towards, because then
 it will highlight for them and they can confirm with you
 that you got the right thing. It may be a good idea to
 come up with a simple gesture for yes or not that the
 other person can use. For example, smiling or blinking 
 for yes or raising their eyebrows for no.

 Sorry to interrupt myself, but there's something
 important I forgot to mention here. When you're talking
 to the other person, remember not to talk about buttons
 on the left or right, because they're actually on opposite
 sides for the other person. My right is your left, see?
 If you see "yes" on the your
 right, they will see it on their right because the video
 feed is flipped (otherwise anything with words in your
 video would look backwards). Back to the video.

 So far we've been using the "Quick" layout, which has
 a few simple options. There are other layouts we can
 load as well. I'll go ahead and load one now [send].
 Do you see how the layout changed to some new options?
 You can load a different layout by hitting "layout"
 and choosing a different view. Try loading a new layout
 now. [wait for layout change]

 Nice job! You can switch between layouts as much as you 
 need, depending on what you're talking about. It's probably
 a good idea to check with the other person before 
 changing the layout, in case they're still trying to 
 say something. Nobody likes being cut off. Also you can
 always jump back to the "Quick" layout by hitting "Quick"
 at the top left.

 In addition to the default layouts, you can set custom
 options at any time. You may have specific topics you think
 they might be interested in, or you want to ask a 
 question that has multiple possible answers. To change
 the layout by hand, hit "Customize". You should see a 
 layout pop up with text boxes. You can change how many
 text boxes are shown, in case you need fewer options or
 it's hard to tell which choice they're looking at.
 Just tap in any of the boxes and change them to whatever
 you like. When you're done hit "Update Buttons" to make
 the change. [wait for customization]

 There you go, now you know how to customize a layout!
 Now you can use Co-VidSpeak to discuss just about 
 anything! Remember that if the other person is tired
 or having trouble focusing, changing the layout a lot 
 may be difficult for them to follow along with.

 Hi, other me again. You'll see a reminder of this
 when customizing, but remember that if you customize
 a layout, it'll show up exactly how you create it for
 the communicator's side, since they'll be the one
 possibly using eye gestures. If you're on the other
 side, the buttons on the left and right will be switched
 for you. So don't, like, freak out if you customize a board
 and the sides get switched for you.
 Anyway, I'll go now.

 Another nice thing about Co-VidSpeak is that you can
 send reactions using emoji. Here, I'll send you a party
 emoji [send]. Now let's see if you can send me an 
 emoji back. Hit "React" and then choose a reaction to
 send to me. [wait for emoji]

 Reactions can be a quick and easy way to show sympathy
 or other feelings without having to use words. It turns
 out there's actually a lot we can say without speaking.

 One other feature of Co-VidSpeak is the ability to send
 photos, videos, or share your screen, with the other
 person. This isn't supported on all devices, so you
 may not be able to right now, but if you hit
 "More" and then "Show", there may be options to share
 a picture, a video, or share your screen. When you do
 this you'll see your video preview change to show
 whatever it is you're sharing. You should still be 
 able to talk while sharing. If it's a video you can
 tap the preview to pause or resume. Once you're done
 sharing you can hit the circle "x" to end the share
 and go back to showing your video feed. I'll give you
 a moment to try it out if you'd like to. [wait for ready]

 Those are the main features of Co-VidSpeak! You can 
 also use your keyboard to type custom messages, or
 use the keyboard layout [jump to keyboard layout] 
 to help the other person
 write a message that isn't available from the default
 layouts [send "y"] [send "o"]. If you prefer no
 pictures or different pictures for the buttons, you can
 find that option by hitting "More" and then "Settings".

 Thanks for taking some time to learn about Co-VidSpeak!
 Feel free to play around as much as you'd like in this
 practice room. When you're done practicing hit "More" 
 and then "End" to leave the room.

 [extra goodies at the end after a long pause]
*/
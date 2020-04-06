var audio_analysers = [];
var add_dom = function(elem, track, user) {
  if(elem.tagName == 'AUDIO') {
    if(true) { // if I'm the communicator, analyze, otherwise it should only add for communicator
      var context = new (window.AudioContext || window.webkitAudioContext)();
      var analyser = context.createAnalyser();
      var source = context.createMediaElementSource(elem);
      source.connect(analyser);
      audio_analysers.push({
        user: user, 
        analyser: analyser, 
        audio_track: track,
        bins: analyser.frequencyBinCount,
        frequency_array: new Uint8Array(analyser.frequencyBinCount)
      });
      analyser.connect(context.destination);
      if(!audio_loop.running) {
        audio_loop.running = true;
        audio_loop();
      }
    }
  }
  elem.classList.add("room-" + track.type);
  elem.setAttribute('data-track-id', track.id);
  elem.setAttribute('data-user-id', user.id);
  document.getElementById('partner').appendChild(elem);
  if(track.type == 'video') {
    setTimeout(function() {
      room.size_video();
    }, 500);
    room.current_video_id = track.id;
  }
}
remote.addEventListener('track_added', function(data) {
  var track = data.track;
  if(track.generate_dom) {
    console.log("adding track", track);
    if(track.type == 'video' || track.type == 'audio') {
      var priors = document.getElementById('partner').getElementsByClassName("room-" + track.type);
      for(var idx = 0; idx < priors.length; idx++) {
        if(priors.getAttribute('data-user_id') == data.user_id) {
          priors[idx].parentNode.removeChild(priors[idx]);
        }
      }
    }
    add_dom(track.generate_dom(), data.track, data.user);
  }
});
var audio_loop = function() {
  if(audio_analysers.length > 0) {
    var biggest = null;
    audio_analysers.forEach(function(ana) {
      ana.analyser.getByteFrequencyData(ana.frequency_array);
      var tally = 0;
      for(var i = 0; i < ana.bins; i++){
        tally = tally + ana.frequency_array[i];
      }
      ana.output = (tally / ana.bins);
      if(!biggest || ana.output > biggest.output) {
        biggest = ana;
      }
    });
    // set user as loudest, update display
  }
  window.requestAnimationFrame(audio_loop);
};
remote.addEventListener('track_removed', function(data) {
  var track = data.track;
  if(track.type == 'video' || track.type == 'audio') {
    var priors = document.getElementById('partner').getElementsByClassName("room-" + track.type);
    for(var idx = 0; idx < priors.length; idx++) {
      if(priors.getAttribute('data-user_id') == data.user_id) {
        priors[idx].parentNode.removeChild(priors[idx]);
      }
    }
    if(data.newest_other) {
      add_dom(data.newest_other, data.track, data.user);
    }
  }
});
remote.addEventListener('user_added', function(data) {
  // TODO: keep a rotation of helpers for the communicator,
  // and keep communicators on everyone else's view
  setTimeout(function() {
    room.send_update();
  }, 500);
});
remote.addEventListener('user_removed', function(data) {
});
remote.addEventListener('message', function(data) {
  room.handle_message(data);
});
// TODO: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
var zoom_factor = 1.1;
var reactions = [
  {text: "laugh", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f602.svg"},
  {text: "sad", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f622.svg"},
  {text: "kiss", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f618.svg"},
  {text: "heart eyes", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60d.svg"},
  {text: "party", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f973.svg"},
  {text: "thumbs up", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44d.svg"},
  {text: "rose", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f339.svg"},
  {text: "heart", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2764.svg"},
  {text: "pray", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64f-1f3fe.svg"},
  {text: "clap", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg"},
  {text: "tired", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f634.svg"},
  {text: "mad", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f621.svg"},
  {text: "barf", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f92e.svg"},
  {text: "rolling eyes", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f644.svg"},
  {text: "shrug", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f937-200d-2640-fe0f.svg"},
];
var default_buttons = [
  {text: 'hi', id: 1, image_url: "https://lessonpix.com/drawings/858816/150x150/858816.png"},
  {text: 'Start Over', id: 2},
  {text: 'goodbye', id: 3, image_url: "https://lessonpix.com/drawings/44246/150x150/44246.png"},
  {text: 'yes', id: 4, image_url: "https://lessonpix.com/drawings/13097/150x150/13097.png"},
  {text: 'no', id: 5, image_url: "https://lessonpix.com/drawings/13178/150x150/13178.png"},
  {text: 'How are things?', id: 6, image_url: "https://lessonpix.com/drawings/9560/150x150/9560.png"},
  {text: 'tell me more', id: 7, image_url: "https://lessonpix.com/drawings/34535/150x150/34535.png"},
  {text: 'I\'m tired', id: 8, image_url: "https://lessonpix.com/drawings/509/150x150/509.png"},
];
// sharing photos/videos
// love it, that's awesome, so cute, no way
var grids = [
  // afraid, confused
  {id: 'feelings', name: 'feelings', image_url: "https://lessonpix.com/drawings/4720/150x150/4720.png", buttons: [
    {id: 1, text: "tired", image_url: "https://lessonpix.com/drawings/509/150x150/509.png"},
    {id: 2, text: "Start Over", image_url: ""},
    {id: 3, text: "hungry", image_url: "https://lessonpix.com/drawings/1813/150x150/1813.png"},
    {id: 4, text: "happy", image_url: "https://lessonpix.com/drawings/18080/150x150/18080.png"},
    {id: 5, text: "sad", image_url: "https://lessonpix.com/drawings/1695/150x150/1695.png"},
    {id: 6, text: "excited", image_url: "https://lessonpix.com/drawings/1689/150x150/1689.png"},
    {id: 7, text: "bored", image_url: "https://lessonpix.com/drawings/713417/150x150/713417.png"},
    {id: 8, text: "frustrated", image_url: "https://lessonpix.com/drawings/113206/150x150/113206.png"}
  ]},
  // head, eye, throat, mouth, ear, chest, stomach, back, arm, leg, tongue
  // pain scale
  // likert scale
  // medical requests (nurse, suction, temperature, adjust, uncomfortable)
  // pillow, bed, up, down, on stomach, on side, head, arms, pain, okay, itchy, out of bed, uncomfortable, IV, massage, rub, sit up, lay down
  // swab mouth, dry lips, light on/off, washcloth on head, clean glasses, cold, hot, open/close curtain, bathroom, when tube out of mouth
  // leave me alone, listen to music, read book
  // dull, sharp, everywhere, itch, sting, hurts, aches, burns, stuck
  // how am I doing?
  // prayer, don't leave, wash hair, brush teeth, brush hair
  {id: 'body', name: 'body', image_url: "https://lessonpix.com/drawings/1354/150x150/1354.png", buttons: [
    {id: 1, text: "head", image_url: "https://lessonpix.com/drawings/6844/150x150/6844.png"},
    {id: 2, text: "Start Over", image_url: ""},
    {id: 3, text: "higher", image_url: "https://lessonpix.com/drawings/812/150x150/812.png"},
    {id: 4, text: "yes", image_url: "https://lessonpix.com/drawings/13097/150x150/13097.png"},
    {id: 5, text: "no", image_url: "https://lessonpix.com/drawings/13178/150x150/13178.png"},
    {id: 6, text: "torso", image_url: "https://lessonpix.com/drawings/515/150x150/515.png"},
    {id: 7, text: "limbs", image_url: "https://lessonpix.com/drawings/9729/150x150/9729.png"},
    {id: 8, text: "lower", image_url: "https://lessonpix.com/drawings/816/150x150/816.png"}
  ]},
  {id: 'requests', name: 'requests', image_url: "https://lessonpix.com/drawings/234158/150x150/234158.png", buttons: [
    {id: 1, text: "Tell me a Story", image_url: "https://lessonpix.com/drawings/7369/150x150/7369.png"},
    {id: 2, text: "Start Over", image_url: ""},
    {id: 3, text: "Read to Me", image_url: "https://lessonpix.com/drawings/6012/150x150/6012.png"},
    {id: 4, text: "more", image_url: "https://lessonpix.com/drawings/850/150x150/850.png"},
    {id: 5, text: "done", image_url: "https://lessonpix.com/drawings/13178/150x150/13178.png"},
    {id: 6, text: "Sing to Me", image_url: "https://lessonpix.com/drawings/1090436/150x150/1090436.png"},
    {id: 7, text: "How was Your Day?", image_url: "https://lessonpix.com/drawings/211740/150x150/211740.png"},
    {id: 8, text: "Play Me a Song", image_url: "https://lessonpix.com/drawings/58722/150x150/58722.png"}
  ]},
];
var room = {
  size_video: function() {
    var height = window.innerHeight - 30;
    var grid = document.getElementsByClassName('grid')[0];
    if(!grid) { return; }
    var buttons = grid.getElementsByClassName('button');
    for(var idx = 0; idx < buttons.length; idx++) {
      if(height / 5 < 100) {
        buttons[idx].style.height = (height / 5) + 'px';
      } else {
        buttons[idx].style.height = '';
      }
    }
    var box = document.getElementById('partner');
    var elem = box && box.getElementsByTagName('VIDEO')[0];
    if(box && elem) {
      var rect = box.getBoundingClientRect();
      var bw = rect.width;
      var bh = rect.height;
      var zoom = room.zoom_level || 1.0;
      var vw = elem.videoWidth;
      var vh = elem.videoHeight;  
      if(!vw || !vh) { return; }
      var xscale = bw / vw;
      var yscale = bh / vh;
      if(vw * zoom < bw && vh * zoom < bh) {
        room.zoom_level = zoom * zoom_factor;
        return room.size_video();
      }
      var scale = Math.max(xscale, yscale);
      elem.style.width = (vw * scale * zoom) + "px";
      elem.style.height = (vh * scale * zoom) + "px";
      var fudge_x = (((vw * scale * zoom) - bw) / -2);
      var fudge_y = (((vh * scale * zoom) - bh) / -2);
      var shift_x = 0;
      var shift_y = 0;
      if(room.shift_x && fudge_x < 0) {
        shift_x = Math.max(Math.min(room.shift_x || 0, -1 * fudge_x), fudge_x);
      }
      if(room.shift_y && fudge_y < 0) {
        shift_y = Math.max(Math.min(room.shift_y || 0, -1 * fudge_y), fudge_y);  
      }
      console.log("SCALE", fudge_x, fudge_y, shift_x, shift_y);
      elem.style.marginLeft = (fudge_x + shift_x) + "px";
      elem.style.marginTop = (fudge_y + shift_y) + "px";
    }
  },
  confirm_exit: function() {
    // TODO: confirmation of exit
  },
  show_invite: function() {
    // TODO: invite popup
  },
  flip_video: function() {
    // TODO: transform: scaleX(-1);
  },
  mute_self: function() {
    // TODO: unpublish the audio feed
  },
  share_screen: function() {
    // TODO: publish screen share stream
  },
  share_image: function() {
    // TODO: publish stream canvas
  },
  share_video: function() {
    // TODO: is this possible?
    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Manipulating_video_using_canvas
    // https://developers.google.com/web/updates/2016/10/capture-stream
  },
  zoom: function(zoom_in) {
    room.zoom_level = (room.zoom_level || 1.0);
    if(zoom_in) {
      room.zoom_level = room.zoom_level * zoom_factor;
    } else {
      room.zoom_level = room.zoom_level / zoom_factor;
    }
    room.size_video();
  },
  assert_grid: function(buttons) {
    var now = (new Date()).getTime();
    room.buttons = buttons.map(function(b) {
      return room.simple_button(b);
    });
    room.buttons.set_at = now;
    room.asserted_buttons = {
      set_at: now,
      buttons: room.buttons
    };
    room.send_update();
    room.show_grid();
  },
  send_image: function(image_url, alt) {
    room.show_image(image_url, alt, false);
    if(!room.current_room) { return; }
    remote.send_message(room.current_room.id, {
      from_communicator: room.current_room.for_self,
      action: 'image',
      url: image_url,
      text: alt
    })
  },
  send_update: function() {
    if(room.update_timeout) {
      clearTimeout(room.update_timeout);
      room.update_timeout = null;
    }
    if(!room.current_room) { return; }
    var track_ids = [];
    for(var idx = 0; idx < (room.local_tracks || []).length; idx++) {
      track_ids.push(room.local_tracks[idx].id);
    }
    var message = {
      action: 'update',
      user_id: room.current_room.user_id,
      tracks: track_ids
    }
    if(room.asserted_buttons) {
      room.asserted_buttons.buttons = room.asserted_buttons.buttons.map(function(b) { return room.simple_button(b)});
      message.asserted_buttons = room.asserted_buttons
    }
    remote.send_message(room.current_room.id, message);
    room.update_timeout = setTimeout(function() {
      room.send_update();
    }, 5000);
  },
  populate_reactions: function() {
    var container = document.getElementsByClassName('reactions')[0];
    if(container) {
      container.innerHTML = "";
      reactions.forEach(function(reaction) {
        var img = document.createElement("img");
        img.src = reaction.url;
        img.alt = reaction.text;
        container.appendChild(img);
      });  
    }  
  },
  populate_grids: function() {
    var container = document.getElementsByClassName('grids')[0];
    if(container) {
      container.innerHTML = "";
      grids.forEach(function(grid) {
        var div = document.createElement('div');
        div.classList.add('grid_option');
        div.innerText = grid.name;
        var img = document.createElement('img');
        img.src = grid.image_url;
        img.alt = '';
        div.setAttribute('data-id', grid.id);
        div.appendChild(img)
        container.appendChild(div);
      });  
    }  
  },
  start: function() {
    // TODO: if the user hasn't accepted terms, pop them up
    // TODO: show an intro video option (always for communicator, once for visitors)
    // TODO: if not over https and not on localhost, pre-empt error
    // TODO: show loading message
    var room_id = (location.pathname.match(/\/rooms\/([\w:]+)/) || {})[1];
    room.populate_grids();
    room.populate_reactions();
    room.size_video();
    var user_id = localStorage.user_id;
    if(!user_id) {
      user_id = (new Date()).getTime() + ":" + Math.round(Math.random() * 9999999);
    }
    var enter_room = function() {
      session.ajax('/api/v1/rooms/' + room_id, {
        method: 'PUT',
        data: {user_id: user_id, type: remote.backend} 
      }).then(function(res) {
        remote.start_local_tracks().then(function(tracks) {
          for(var idx = 0; idx < tracks.length; idx++) {
            if(tracks[idx].type == 'video') {
              document.getElementById('communicator').innerHTML = "";
              document.getElementById('communicator').appendChild(tracks[idx].generate_dom());
            }
          }
          remote.connect_to_remote(res.access_token, res.room.key).then(function(room_session) {
            console.log("Successfully joined a Room: " + room_session.id + " as " + res.user_id);
            room_session.user_id = res.user_id;
            room_session.for_self = room_id == localStorage.room_id;
            $(".grid").toggleClass('communicator', room_session.for_self)
            room.current_room = room_session;
            room.local_tracks = tracks;
            room.send_update();
            room.show_grid();
          }, function(error) {
            console.error("Unable to connect to Room: " + error.message);
          });
        }, function(err) {
          console.error("Unable to create local tracks: ", err);
        });
      }, function(err) {
        // TODO: alert the user, this will happen if the
        // communicator is no longer in the room
        console.error("Room creation error: ", err);
      });
    };
    if(localStorage.user_id && room_id == localStorage.room_id) {
      // We check user auth here to make sure the user/room hasn't expired
      session.ajax('/api/v1/users', {
        method: 'POST',
        data: {user_id: localStorage.user_id, type: remote.backend}
      }).then(function(res) {
        enter_room();
      }, function(err) {
        console.error("User confirmation error: ", err);
      });
    } else {
      enter_room();
    }
  },
  show_grid: function() {
    var for_communicator = room.current_room && room.current_room.for_self;
    var window_height = window.innerHeight;
    var video_height = window_height - ((window_height / 3) - 7) - (window_height * .12) - 21;
    // document.getElementById('partner').parentNode.style.height = video_height + "px";
    var fill_cell = function(cell, button) {
      var text = cell.getElementsByClassName('text')[0];
      text.innerText = button.text;
      cell.style.visibility = 'visible';
//      cell.style.height = ((window_height / 3) - 7) + "px";
      if(cell.classList.contains('skinny')) {
        // cell.style.height = (window_height * .12) + "px";
      }
      cell.parentNode.style.height = window_height + "px";
      // cell.parentNode.style.display = 'block';
      var img = cell.getElementsByTagName('img')[0];
      if(img) {
        if(button.image_url) {
          img.style.visibility = 'visible';
          img.src = "/blank.gif";
          setTimeout(function() {
            img.src = button.image_url;
          }, 10);
        } else {
          img.style.visibility = 'hidden';
        }
      }
      cell.button = button;
      button.cell = cell;
    };
    if(for_communicator) {
      // Default Order
      var grid = document.getElementsByClassName('grid')[0];
      var cells = grid.getElementsByClassName('cell');
      for(var idx = 0; idx < cells.length; idx++) {
        var num = parseInt(cells[idx].getAttribute('data-idx'), 10);
        fill_cell(cells[idx], room.buttons[num]);
      }
    } else {
      // Reverse Order
      var grid = document.getElementsByClassName('grid')[0];
      var cells = grid.getElementsByClassName('cell');
      var new_order = [].concat(room.buttons);
      new_order[0] = room.buttons[2];
      new_order[2] = room.buttons[0];
      new_order[3] = room.buttons[4];
      new_order[4] = room.buttons[3];
      new_order[5] = room.buttons[7];
      new_order[7] = room.buttons[5];
      for(var idx = 0; idx < cells.length; idx++) {
        var num = parseInt(cells[idx].getAttribute('data-idx'), 10);
        fill_cell(cells[idx], new_order[num]);
      }
    }
  },
  show_image: function(url, text, big_image) {
    room.image_slots = room.image_slots || [];
    room.image_slots.index = room.image_slots.index || 0;
    var found_empty = false;
    for(var idx = 0; idx < 3; idx++) {
      if(!room.image_slots[idx] && !found_empty) {
        found_empty = true;
        room.image_slots.index = idx;
      }
    }
    var idx = room.image_slots.index;
    var img = document.createElement('img');
    img.classList.add('reaction');
    img.style.left = ((idx * 60) + 10) + "px";
    img.src = url;
    img.alt = text;
    var wait = 10;
    if(room.image_slots[idx]) {
      var prior = room.image_slots[idx];
      prior.style.opacity = 0;
      setTimeout(function() {
        prior.parentNode.removeChild(prior);
      }, 1000);
      wait = 510;
    }
    room.image_slots[idx] = img;
    room.image_slots.index = (idx + 1) % 3;
    setTimeout(function() {
      var complete = function() {
        if(room.image_slots[idx] == img) {
          room.image_slots[idx] = null;
        }
        img.style.opacity = 0;
        setTimeout(function() {
          if(img.parentNode) {
            img.parentNode.removeChild(img);
          }
        }, 500);
      };
      document.getElementsByClassName('preview')[0].appendChild(img);
      if(!big_image) {
        img.classList.add('finished');
        setTimeout(complete, 10000);
      } else {
        setTimeout(function() {
          img.classList.add('finished');
          setTimeout(complete, 20000);
        }, 3000);
      }
      setTimeout(function() {
        img.style.opacity = 1;
      }, 100);
    }, wait);
  },
  toggle_zoom: function(force) {
    var $nav = $("#nav");
    if(force == null) {
      force = $nav.css('opacity') == '1' ? false : true;
    }
    var now = (new Date()).getTime();
    if(!force && $nav[0].shown_at && $nav[0].shown_at > now - 500) {
      return;
    }
    $nav.css('opacity', force ? 1 : 0);
    $nav[0].shown_at = now;
    $nav[0].hide_at = now + 5000;
    if(!room.nav_interval) {
      room.nav_interval = setInterval(function() {
        var now = (new Date()).getTime();
        var hide_at = ($("#nav")[0] || {}).hide_at;
        if(hide_at && hide_at < now) {
          $("#nav").css('opacity', 0);
          $("#nav")[0].hide_at = null;
        }
      }, 500);
    }
  },
  handle_message: function(data) {
    var json = data.message;
    if(!room.current_room || data.user_id == room.current_room.user_id) { return; }
    if(json && json.action == 'click') {
      var button = (room.buttons || []).find(function(b) { return b.id == json.button.id; });
      if(button && button.cell) {
        button.cell.classList.add('highlight');
        setTimeout(function() {
          button.cell.classList.remove('highlight');
        }, 5000);
      }
      room.buttons.forEach(function(button) {
  
      });
    } else if(json && json.action == 'image') {
      debugger
      var big_image = false;
      if(data.message.from_communicator && !room.current_room.for_self) {
        // if sent by the communicator, who is not you
        // show a big version of the image
        big_image = true;
      } else if(!data.message.from_communicator && room.current_room.for_self) {
        // or if sent by someone else and you are the communicator
        // show a big version of the image
        big_image = true;
      } else {
        // show a small version of the image
      }
      room.show_image(json.url, json.text, big_image);
    } else if(json && json.action == 'update') {
      if(data.user && data.user.ts_offset != null && json.asserted_buttons) {
        // accept the other user's butttons if they were updated
        // more recently than your own
        var ts = json.asserted_buttons.set_at - data.user.ts_offset;
        if(room.buttons && (!room.buttons.set_at || room.buttons.set_at < ts)) {
          var changed = false;
          room.buttons.forEach(function(btn, idx) {
            if(!room.simple_button(btn, json.asserted_buttons.buttons[idx]).same) {
              changed = true;
            }
          });
          if(changed) {
            room.asserted_buttons = json.asserted_buttons;
            room.asserted_buttons.set_at = ts - 1000;
            room.buttons = json.asserted_buttons.buttons;
            room.buttons.set_at = ts - 1000;
            room.show_grid();
          }
        }
      }
    } else {
      // TODO: if more users in the feed, ensure
      // that everyone else sees the communicator's video feed
      console.log("MESSAGE:", json);
    }  
  },
  simple_button: function(btn, comp) {
    if(!btn) { return {}; }
    var res = {
      id: btn.id,
      text: btn.text,
      image_url: btn.image_url
    };
    if(comp) {
      res.same = comp.id == btn.id && comp.text == btn.textt && comp.image_url == btn.image_url;
    }
    return res;
  }
};
window.addEventListener('resize', function() {
  room.size_video();
  room.show_grid();
});
var shift = function(event) {
  room.shift_x = event.clientX - (room.drag_x || event.clientX);
  room.shift_y = event.clientY - (room.drag_y || event.clientY);
  room.size_video();
  room.toggle_zoom(true);
  console.log("drag", room.shift_x, room.shift_y);
}
var drag = function(event) {
  room.drag_x = event.clientX - (room.shift_x || 0);
  room.drag_y = event.clientY - (room.shift_y || 0);
};
document.addEventListener('mousemove', function(event) {
  if($(event.target).closest('.grid').length == 0) { return; }
  if($(event.target).closest('#partner').length > 0) {
    if(event.buttons == 1) {
      event.preventDefault();
      shift(event);
    } else {
      room.toggle_zoom(true);
    }
  }
});
document.addEventListener('touchmove', function(event) {
  if($(event.target).closest('.grid').length == 0) { return; }
  if($(event.target).closest('#partner').length > 0) {
    event.preventDefault();
    shift(event);
  }
});
document.addEventListener('mousedown', function(event) {
  if($(event.target).closest('.grid').length == 0) { return; }
  if($(".popover:visible").length > 0) {
    if($(event.target).closest('.button:not(.sub_button)').find(".popover:visible").length == 0) {
      $(".popover:visible").css('display', 'none');
    }
  }
  if($(event.target).closest('#partner').length > 0) {
    event.preventDefault();
    drag(event);
  } else if(true) {
    event.preventDefault();
  }
});
document.addEventListener('touchstart', function(event) {
  if($(event.target).closest('.grid').length == 0) { return; }
  if($(".popover:visible").length > 0) {
    if($(event.target).closest('.button:not(.sub_button)').find(".popover:visible").length == 0) {
      $(".popover:visible").css('display', 'none');
    }
  }
  if($(event.target).closest('#partner').length > 0) {
    event.preventDefault();
    drag(event);
  } else if(true) {
    event.preventDefault();
  }
});
document.addEventListener('click', function(event) {
  if($(event.target).closest('.grid').length == 0) { return; }
  var $cell = $(event.target).closest('.cell');
  var $button = $(event.target).closest('.button');
  var $partner = $(event.target).closest('#partner');
  var $zoom = $(event.target).closest('.zoom');
  if($(event.target).closest("#nav").css('opacity') == '0') {
    $partner = $("#partner");
    $zoom.blur();
  }
  if($partner.length > 0) {
    room.toggle_zoom();
  } else if($cell.length > 0) {
    if(room.current_room) {
      remote.send_message(room.current_room.id, {action: 'click', button: {id: $cell[0].button.id }});
    }
    $cell.addClass('my_highlight');
    $cell.blur();
    setTimeout(function() {
      $cell.removeClass('my_highlight');
    }, 1000);
  } else if($button.length > 0) {
    event.preventDefault();
    if($button.hasClass('with_popover')) {
      if($button.find(".popover").css('display') != 'block') {
        $button.find(".popover").css('display', 'block');
        return;
      } else if($(event.target).closest(".popover").length == 0) {
        $button.find(".popover").css('display', 'none');
        return;
      }
    }
    $(".popover:visible").css('display', 'none');
    var action = $button.attr('data-action');
    if(action == 'end') {
      modal.open("Leave Room?", document.getElementById('confirm_exit'), [
        {label: "Leave Room", action: "leave", callback: function() {
          modal.close();
          location.href = "/thanks";
        }},
        {label: "Cancel", action: "close"}
      ]);
    } else if(action == 'customize') {
      alert('not implemented');
    } else if(action == 'info' || action == 'invite') {
      var url = location.href + "/join";
      document.querySelector('#invite_modal .link').innerText = url;
      var actions = [
        {action: 'copy', label: "Copy Link", callback: function() {
          // Select the link anchor text  
          extras.copy(url).then(function(res) {
            if(res.copied) {
              alert('copied!');  
            }
          });
          modal.close();
        }}
      ];
      if(navigator.canShare && navigator.canShare()) {
        actions.push({action: 'share', label: "Share", callback: function() {
          if(navigator.share) {
            navigator.share({url: url});
          }
          modal.close();
        }})
      }
      modal.open("Invite a Visitor", document.getElementById('invite_modal'), actions);
      if(window.QRCode) {
        var qr = new window.QRCode(document.querySelector('.modal #invite_modal .qr_code'), url);
      }
    } else if(action == 'quick') {
      room.assert_grid(room.default_buttons);
    } else if(action == 'load') {
      var id = $(event.target).closest('.grid_option').attr('data-id');
      if(id) {
        var grid = grids.find(function(g) { return g.id == id; });
        if(grid) {
          room.assert_grid(grid.buttons);
        }
      }
      $button.find(".popover").css('display', 'none');
    } else if(action == 'send') {
      var container = document.getElementsByClassName('reactions')[0];
      if($(event.target).closest(".reactions").length > 0 && event.target.tagName == 'IMG') {
        container.parentNode.style.display = 'none';
        room.send_image(event.target.src, event.target.alt);
      } else {
        container.parentNode.style.display = 'none';
      }
    }
  } else if($zoom.length > 0) {
    event.preventDefault();
    $zoom.blur();
    $("#nav")[0].hide_at = (new Date()).getTime() + 10000;
    if($("#nav").css('opacity') != '1') { return; }
    if($zoom.attr('data-direction') == 'in') {
      room.zoom(true);
    } else {
      room.zoom(false);
    }
  }
});
room.default_buttons = default_buttons;
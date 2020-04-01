remote.addEventListener('track_added', function(data) {
  var track = data.track;
  if(track.generate_dom) {
    console.log("adding track", track);
    if(track.type == 'video' || track.type == 'audio') {
      var priors = document.getElementById('partner').getElementsByTagName(track.type);
      for(var idx = 0; idx < priors.length; idx++) {
        priors[idx].parentNode.removeChild(priors[idx]);
      }
    }
    var elem = track.generate_dom();
    document.getElementById('partner').appendChild(elem);
    if(track.type == 'video') {
      setTimeout(function() {
        room.size_video();
      }, 500);
      room.current_video_id = track.id;
    }
  }
});
remote.addEventListener('user_added', function(data) {
  // TODO: keep a rotation of helpers for the communicator,
  // and keep communicators on everyone else's view
});
remote.addEventListener('user_removed', function(data) {
});
remote.addEventListener('message', function(data) {
  room.handle_message(data);
});
var zoom_factor = 1.1;
var room = {
  size_video: function() {
    var box = document.getElementById('partner');
    var elem = box && box.getElementsByTagName('VIDEO')[0];
    if(box && elem) {
      var rect = box.getBoundingClientRect();
      var bw = rect.width;
      var bh = rect.height;
      var zoom = room.zoom_level || 1.0;
      var vw = elem.videoWidth;
      var vh = elem.videoHeight;  
      var xscale = bw / vw;
      var yscale = bh / vh;
      if(vw * zoom < bw && vh * zoom < bh) {
        room.zoom_level = room.zoom_level * zoom_factor;
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
  zoom: function(zoom_in) {
    room.zoom_level = (room.zoom_level || 1.0);
    if(zoom_in) {
      room.zoom_level = room.zoom_level * zoom_factor;
    } else {
      room.zoom_level = room.zoom_level / zoom_factor;
    }
    room.size_video();
  },
  send_image: function(image_url, alt) {
    if(!room.current_room) { return; }
    remote.send_message(room.current_room.id, {
      action: 'image',
      url: image_url,
      text: alt
    })
    room.show_image(image_url, alt, false);
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
    remote.send_message(room.current_room.id, {
      user_id: room.current_room.user_id,
      tracks: track_ids
    });
    room.update_timeout = setTimeout(function() {
      room.send_update();
    }, 5000);
  },
  start: function() {
    var room_id = (location.pathname.match(/\/rooms\/(\w+)/) || {})[1];
    var enter_room = function() {
      session.ajax('/api/v1/rooms/' + room_id, {
        method: 'PUT',
        data: {user_id: localStorage.user_id || room_id} 
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
            room_session.communicator_id = room_id;
            room_session.for_self = room_id == res.user_id;
            room.current_room = room_session;
            room.local_tracks = tracks;
            room.send_update();
            room.show_grid(room_session.for_self);
          }, function(error) {
            console.error("Unable to connect to Room: " + error.message);
          });
        }, function(err) {
          console.error("Unable to create local tracks: ", err);
        });
      }, function(err) {
        console.error("Room creation error: ", err);
      });
    };
    if(localStorage.user_id && room_id != localStorage.user_id) {
      session.ajax('/api/v1/users', {
        method: 'POST',
        data: {user_id: localStorage.user_id}
      }).then(function(res) {
        enter_room();
      }, function(err) {
        console.error("User confirmation error: ", err);
      });
    } else {
      enter_room();
    }
  },
  show_grid: function(for_communicator) {
    if(for_communicator) {
      // Default Order
      var grid = document.getElementsByClassName('grid')[0];
      var cells = grid.getElementsByClassName('cell');
      for(var idx = 0; idx < cells.length; idx++) {
        var num = parseInt(cells[idx].getAttribute('data-idx'), 10);
        cells[idx].innerText = room.buttons[num].text;
        cells[idx].style.visibility = 'visible';
        cells[idx].button = room.buttons[num];
        room.buttons[num].cell = cells[idx];
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
        cells[idx].innerText = new_order[num].text;
        cells[idx].style.visibility = 'visible';
        cells[idx].button = new_order[num];
        new_order[num].cell = cells[idx];
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
      var big_image = false;
      if(data.user_id == room.current_room.communicator_id && !room.current_room.for_self) {
        // if sent by the communicator, who is not you
        // show a big version of the image
        big_image = true;
      } else if(data.user_id != room.current_room.communicator_id && room.current_room.for_self) {
        // or if sent by someone else and you are the communicator
        // show a big version of the image
        big_image = true;
      } else {
        // show a small version of the image
      }
      room.show_reaction(json.url, json.text, big_image);
    } else {
      // TODO: if more users in the feed, ensure
      // that everyone else sees the communicator's video feed
      console.log("MESSAGE:", json);
    }  
  }
};
window.addEventListener('resize', function() {
  room.size_video();
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
  if($(event.target).closest('#partner').length > 0 && event.buttons == 1) {
    event.preventDefault();
    shift(event);
  }
});
document.addEventListener('touchmove', function(event) {
  if($(event.target).closest('#partner').length > 0) {
    event.preventDefault();
    shift(event);
  }

});
document.addEventListener('mousedown', function(event) {
  if($(event.target).closest('#partner').length > 0) {
    event.preventDefault();
    drag(event);
  }
});
document.addEventListener('touchstart', function(event) {
  if($(event.target).closest('#partner').length > 0) {
    event.preventDefault();
    drag(event);
  }
});
document.addEventListener('click', function(event) {
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
    remote.send_message({action: 'click', button: {id: $cell[0].button.id }});
    $cell.addClass('my_highlight');
    setTimeout(function() {
      $cell.removeClass('my_highlight');
    }, 1000);
  } else if($button.length > 0) {
    var action = $button.attr('data-action');
    if(action == 'end') {
      alert('done!');
    } else if(action == 'send') {
      room.send_image("https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f339.svg", "rose");
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
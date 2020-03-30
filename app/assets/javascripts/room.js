var room = {
  start: function() {
    var room_id = (location.pathname.match(/\/rooms\/(\w+)/) || {})[1];
    var local_track = new Twilio.Video.LocalDataTrack();
    _room.local_track = local_track;
    var got_message = function(str) {
      var json = null;
      try {
        json = JSON.parse(str);
      } catch(e) { }
      if(json && json.action == 'click') {
        var button = (room.buttons || []).find(function(b) { return b.id == json.button.id; });
        if(button && button.cell) {
          button.cell.classList.add('highlight');
          setTimeout(function() {
            button.cell.classList.remove('highlight');
          }, 5000);
        }
        room.buttons.forEach(function(button) {

        })
      } else {
        console.log("MESSAGE:", json);
      }
    };
    var enter_room = function() {
      session.ajax('/api/v1/rooms/' + room_id, {
        method: 'PUT',
        data: {user_id: localStorage.user_id || room_id} 
      }).then(function(res) {
        Twilio.Video.createLocalTracks({
          audio: true,
          video: true
        }).then(function(tracks) {
          tracks.push(local_track);
          Twilio.Video.connect(res.access_token, { name:res.room.key, tracks: tracks }).then(room => {
            console.log(`Successfully joined a Room: ${room} as ${res.user_id}`);
            if(room_id == res.user_id) {
              // Default Order
              var grid = document.getElementsByClassName('grid')[0];
              var cells = grid.getElementsByClassName('cell');
              for(var idx = 0; idx < cells.length; idx++) {
                var num = parseInt(cells[idx].getAttribute('data-idx'), 10);
                cells[idx].innerText = _room.buttons[num].text;
                cells[idx].style.visibility = 'visible';
                cells[idx].button = _room.buttons[num];
                _room.buttons[num].cell = cells[idx];
              }
              var again = function() {
                local_track.send(JSON.stringify({a: 1, b: 'ok'}));
                setTimeout(function() {
                  again();
                }, 1000);
              };
              again();
            } else {
              // Reverse Order
              var grid = document.getElementsByClassName('grid')[0];
              var cells = grid.getElementsByClassName('cell');
              var new_order = [].concat(_room.buttons);
              new_order[0] = _room.buttons[2];
              new_order[2] = _room.buttons[0];
              new_order[3] = _room.buttons[4];
              new_order[4] = _room.buttons[3];
              new_order[5] = _room.buttons[7];
              new_order[7] = _room.buttons[5];
              for(var idx = 0; idx < cells.length; idx++) {
                var num = parseInt(cells[idx].getAttribute('data-idx'), 10);
                cells[idx].innerText = new_order[num].text;
                cells[idx].style.visibility = 'visible';
                cells[idx].button = new_order[num];
                new_order[num].cell = cells[idx];
              }
            }
            room.on('participantConnected', participant => {
              console.log(`A remote Participant connected: ${participant}`);
              participant.tracks.forEach(publication => {
                if (publication.isSubscribed) {
                  const track = publication.track;
                  if(track.attach) {
                    console.log("adding track", track);
                    if(track.kind == 'video' || track.kind == 'audio') {
                      var priors = document.getElementById('partner').getElementsByTagName(track.kind);
                      for(var idx = 0; idx < priors.length; idx++) {
                        priors[idx].parentNode.removeChild(priors[idx]);
                      }
                    }
                    document.getElementById('partner').appendChild(track.attach());
                  }
                  track.on('message', function(data) {
                    got_message(data);
                  });
                }
              });
  
              participant.on('trackSubscribed', track => {
                if(track.attach) {
                  console.log("adding track", track);
                  if(track.kind == 'video' || track.kind == 'audio') {
                    var priors = document.getElementById('partner').getElementsByTagName(track.kind);
                    for(var idx = 0; idx < priors.length; idx++) {
                      priors[idx].parentNode.removeChild(priors[idx]);
                    }
                  }
                  document.getElementById('partner').appendChild(track.attach());
                }
                track.on('message', function(data) {
                  got_message(data);
                });
            });            
            });
          }, error => {
            console.error(`Unable to connect to Room: ${error.message}`);
          });
        }, function(err) {

        });

      }, function(err) {

      });
    };
    if(localStorage.user_id && room_id != localStorage.user_id) {
      session.ajax('/api/v1/users', {
        method: 'POST',
        data: {user_id: localStorage.user_id}
      }).then(function(res) {
        enter_room();
      }, function(err) {

      });
    } else {
      enter_room();
    }
  }
};
var _room = room;
document.addEventListener('click', function(event) {
  var $elem = $(event.target).closest('.cell');
  if($elem.length > 0) {
    if(room.local_track) {
      room.local_track.send(JSON.stringify({action: 'click', button: {id: $elem[0].button.id }}));
    }
  }
});
var access = null;
(function() {
  var dwell_time = 1000;
  var dwell_id = null;
  var dwell_history = [];
  var cutoff = null;
  access = {
    start: function(opts) {
      if(opts.type == 'none') { return; }
      if(window.weblinger) {
        var stream = new MediaStream();
        var vid = room.local_tracks.find(function(t) { return t.type == 'video'});
        if(vid && vid.mediaStreamTrack) {
          stream.addTrack(vid.mediaStreamTrack);
          var type = opts.type;
          dwell_time = parseInt(opts.dwell_time, 10);
          var sens = parseFloat(opts.head_sensitivity);

          weblinger.start({
            webgazer_source: "/weblinger.js/lib/webgazer.js/webgazer.js",
            weboji_source: "/weblinger.js/lib/jeelizWeboji/jeelizFaceTransfer.js",
            weboji_nnc_source: "/weblinger.js/lib/jeelizWeboji/jeelizFaceTransferNNC.json.js",
            stream: stream,
            source: type,
            tilt_sensitivity: sens,
            mode: type == 'head' ? 'joystick' : 'pointer',
            selection_type: 'none',
            cursor: type == 'head' ? 'none' : 'red_circle',
            event_callback: function(e) {
              if(document.querySelector('.modal')) {
                return;
              }
              if(e.type == 'stop') {
                var icon = document.querySelector('#alt_access_icon');
                if(icon) {
                  icon.style.display = 'none';
                }
              } else if(e.type == 'linger' && room.buttons) {
                console.log(e.extras);
                var icon = document.querySelector('#alt_access_icon');
                if(icon) {
                  icon.style.display = 'block';
                  if(e.trigger == 'gaze') {
                    icon.querySelector('img').src = "/icons/eye.svg";
                  } else {
                    icon.querySelector('img').src = "/icons/person.svg";                  
                  }  
                }
                var prior = document.querySelector('.cell.hover');
                var hover = null;
                var cell_id = null;
                if(room.buttons.length == 8) {
                  if(e.extras && (e.extras.tilt_x || e.extras.tilt_y)) {
                    if(e.extras.tilt_x > -5 && e.extras.tilt_x < 5 && e.extras.tilt_y > 3) {
                      cell_id = 6;
                    } else if(e.extras.tilt_x > -5 && e.extras.tilt_x < 5 && e.extras.tilt_y < -3) {
                      cell_id = 1;
                    } else if(e.extras.tilt_x < -3 && e.extras.tilt_y > -9 && e.extras.tilt_y < 5) {
                      cell_id = 3;
                    } else if(e.extras.tilt_x > 3 && e.extras.tilt_y > -9 && e.extras.tilt_y < 5) {
                      cell_id = 4;
                    } else if(e.extras.tilt_x < -3 && e.extras.tilt_y < -3) {
                      cell_id = 0;
                    } else if(e.extras.tilt_x > 3 && e.extras.tilt_y < -3) {
                      cell_id = 2;
                    } else if(e.extras.tilt_x < -3 && e.extras.tilt_y > 3) {
                      cell_id = 5;
                    } else if(e.extras.tilt_x > 3 && e.extras.tilt_y > 3) {
                      cell_id = 7;
                    }
                  } else {
                    var height = window.innerHeight;
                    var width = window.innerWidth;
                    if(e.x < width * 5 / 16) {
                      if(e.y < height / 3) {
                        cell_id = 0;
                      } else if(e.y > height * 2 / 3) {
                        cell_id = 5;
                      } else {
                        cell_id = 3;
                      }
                    } else if(e.x > width * 11 / 16) {
                      if(e.y < height / 3) {
                        cell_id = 2;
                      } else if(e.y > height * 2 / 3) {
                        cell_id = 7;
                      } else {
                        cell_id = 4;
                      }
                    } else {
                      if(e.y < height * 5 / 24) {
                        cell_id = 1;
                      } else if(e.y > height * 2 / 3) {
                        cell_id = 6;
                      }
                    }
                  }
                } else if(room.buttons.length == 6) {
                  if(e.extras && (e.extras.tilt_x || e.extras.tilt_y)) {
                    if(e.extras.tilt_x > -1 && e.extras.tilt_x < 1 && e.extras.tilt_y > 3) {
                      cell_id = 6;
                    } else if(e.extras.tilt_x > -1 && e.extras.tilt_x < 1 && e.extras.tilt_y < -3) {
                      cell_id = 1;
                    } else if(e.extras.tilt_x < -3 && e.extras.tilt_y > 1) {
                      cell_id = 3;
                    } else if(e.extras.tilt_x > 3 && e.extras.tilt_y > 1) {
                      cell_id = 4;
                    } else if(e.extras.tilt_x < -3 && e.extras.tilt_y < -1) {
                      cell_id = 0;
                    } else if(e.extras.tilt_x > 3 && e.extras.tilt_y < -1) {
                      cell_id = 2;
                    }
                  } else {
                    var height = window.innerHeight;
                    var width = window.innerWidth;
                    if(e.x < width * 5 / 16) {
                      if(e.y < height / 2) {
                        cell_id = 0;
                      } else {
                        cell_id = 3;
                      }
                    } else if(e.x > width * 11 / 16) {
                      if(e.y < height / 2) {
                        cell_id = 2;
                      } else {
                        cell_id = 4;
                      }
                    } else {
                      if(e.y < height * 5 / 24) {
                        cell_id = 1;
                      } else if(e.y > height * 2 / 3) {
                        cell_id = 6;
                      }
                    }
                  }
                } else if(room.buttons.length == 4) {
                  if(e.extras && (e.extras.tilt_x || e.extras.tilt_y)) {
                    if(e.extras.tilt_x > -1 && e.extras.tilt_x < 1 && e.extras.tilt_y > 3) {
                      cell_id = 6;
                    } else if(e.extras.tilt_x > -1 && e.extras.tilt_x < 1 && e.extras.tilt_y < -3) {
                      cell_id = 1;
                    } else if(e.extras.tilt_x < -3 && e.extras.tilt_y > -1 && e.extras.tilt_y < 1) {
                      cell_id = 3;
                    } else if(e.extras.tilt_x > 3 && e.extras.tilt_y > -1 && e.extras.tilt_y < 1) {
                      cell_id = 4;
                    }
                  } else {
                    var height = window.innerHeight;
                    var width = window.innerWidth;
                    if(e.x < width * 5 / 16) {
                      cell_id = 3;
                    } else if(e.x > width * 11 / 16) {
                      cell_id = 4;
                    } else {
                      if(e.y < height * 5 / 24) {
                        cell_id = 1;
                      } else if(e.y > height * 2 / 3) {
                        cell_id = 6;
                      }
                    }
                  }
                }
                if(cell_id != null) {
                  hover = document.querySelector(".cell[data-idx='" + cell_id + "']");
                }
                if(e.extras) {
                  e.mid_x = e.extras.tilt_x;
                  e.mid_y = e.extras.tilt_y;
                } else {
                  e.mid_x = e.x - (window.innerWidth / 2);
                  e.mid_y = e.y - (window.innerHeight / 2)
                }
                if(cutoff && hover && cutoff.elem == hover) {
                  if(cutoff.x > 0 && e.mid_x > cutoff.x) {
                    hover = null;
                  } else if(cutoff.y > 0 && e.mid_y > cutoff.y) {
                    hover = null;
                  } else if(cutoff.x < 0 && e.mid_x < cutoff.x) {
                    hover = null;
                  } else if(cutoff.y < 0 && e.mid_y < cutoff.y) {
                    hover = null;
                  } else {
                    cutoff = null;
                  }
                }
                if(hover != prior) {
                  clearTimeout(dwell_timer);
                  dwell_history = [];
                  if(prior && prior.classList.contains('hover')) {
                    prior.classList.remove('hover');
                    prior.style.removeProperty('transition');
                    dwell_id = null;
                    prior = null;
                  }
                  if(hover) {
                    var current_dwell_id = (new Date()).getTime() + "-" + Math.random();
                    dwell_id = current_dwell_id;
                    console.log("timer for", hover, prior);
                    var dwell_timer = setTimeout(function() {
                      if(hover.classList.contains('hover') && dwell_id == current_dwell_id) {
                        hover.classList.remove('hover');
                        hover.style.removeProperty('transition');
                        dwell_id = null;
                        if(dwell_history.length > 0) {
                          var avg_x = 0, avg_y = 0;
                          dwell_history.forEach(function(dwell) {
                            avg_x = avg_x + dwell.x;
                            avg_y = avg_y + dwell.y;
                          });
                          avg_x = avg_x / dwell_history.length;
                          avg_y = avg_y / dwell_history.length;
                          cutoff = {elem: hover, x: avg_x / 2, y: avg_y / 2};
                        }
                        dwell_history = [];
                        hover.click();
                        prior = null;

                      }
                    }, dwell_time);
                    hover.classList.remove('highlight');
                    hover.classList.remove('my_highlight');
                    hover.classList.add('hover');
                    hover.style.transition = "background " + dwell_time + "ms ease-in, border-width " + dwell_time + "ms, box-shadow " + dwell_time + "ms, border-color " + dwell_time + "ms";
                  }
                } else {
                  dwell_history.push({x: e.mid_x, y: e.mid_y});
                }
              }
            }
          });
        }
      }
    },
    stop: function() {
      var icon = document.querySelector('#alt_access_icon');
      if(icon) {
        icon.style.display = 'none';
      }
      weblinger.stop(true);
    }
  };
})();
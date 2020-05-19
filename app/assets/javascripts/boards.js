var default_obf = {
  id: 'quick', name: 'quick', ext_covidspeak_skip: true, buttons: [
    {label: 'hi', id: 1},
    {label: 'Start Over', ext_covidspeak_load_root: 'root', id: 2},
    {label: 'goodbye', id: 3},
    {label: 'yes', id: 4},
    {label: 'no', id: 5},
    {label: 'How are things?', id: 6},
    {label: 'tell me more', id: 7},
    {label: 'I\'m tired', id: 8},
  ],
  grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}
}

// sharing photos/videos
// love it, that's awesome, so cute, no way
var obfs = [
  // afraid, confused
  {id: 'feelings', name: 'feelings', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3ad.svg", buttons: [
    {id: 1, label: "tired"},
    {id: 2, label: "Start Over", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "hungry / thirsty"},
    {id: 4, label: "happy"},
    {id: 5, label: "sad"},
    {id: 6, label: "hurt"},
    {id: 7, label: "bored"},
    {id: 8, label: "frustrated"}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
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
  {id: 'body', name: 'body', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6b6.svg", buttons: [
    {id: 1, label: "head"},
    {id: 2, label: "Start Over", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "higher"},
    {id: 4, label: "yes"},
    {id: 5, label: "no"},
    {id: 6, label: "torso"},
    {id: 7, label: "limbs"},
    {id: 8, label: "lower"}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'requests', name: 'requests', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5e3.svg", buttons: [
    {id: 1, label: "Tell me a Story"},
    {id: 2, label: "Start Over", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "Read to Me"},
    {id: 4, label: "more"},
    {id: 5, label: "done"},
    {id: 6, label: "Sing to Me"},
    {id: 7, label: "How was your Day?"},
    {id: 8, label: "Look at Photos"}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'religious', name: 'religious', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26ea.svg", buttons: [
    {id: 1, label: "Pray for me"},
    {id: 2, label: "Start Over", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "Read Scripture"},
    {id: 4, label: "faith"},
    {id: 5, label: "God"},
    {id: 6, label: "Sing me a Hymn"},
    {id: 7, label: "How was Meeting?"},
    {id: 8, label: "Study Together"}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'comments', name: 'comments', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ac.svg", buttons: [
    {id: 1, label: "I miss you"},
    {id: 2, label: "Start Over", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "I can't wait to come Home"},
    {id: 4, label: "I am Scared"},
    {id: 5, label: "Something Hurts"},
    {id: 6, label: "I need a Distraction"},
    {id: 7, label: "I'm Tired of This"},
    {id: 8, label: "What Happens Next?"}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'nav', name: 'multi-level', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d8.svg", buttons: [
    {id: 1, label: "requests", load_board: {id: 'requests'}},
    {id: 2, label: "Start Over", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "comments", load_board: {id: 'comments'}},
    {id: 4, label: "yes"},
    {id: 5, label: "no"},
    {id: 6, label: "feelings", load_board: {id: 'feelings'}},
    {id: 7, label: "body", load_board: {id: 'body'}},
    {id: 8, label: "quick", load_board: {id: 'quick'}}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard', name: 'keyboard', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2328.svg", buttons: [
    {id: 1, label: "abcde", load_board: {id: 'keyboard2'}, image_id: 'i1', ext_covidspeak_image_only: true},
    {id: 2, label: "Clear", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "uvwxyz", load_board: {id: 'keyboard8'}, image_id: 'i3', ext_covidspeak_image_only: true},
    {id: 4, label: "12345", load_board: {id: 'keyboard3'}, image_id: 'i4', ext_covidspeak_image_only: true},
    {id: 5, label: "67890", load_board: {id: 'keyboard7'}, image_id: 'i5', ext_covidspeak_image_only: true},
    {id: 6, label: "fghij", load_board: {id: 'keyboard4'}, image_id: 'i6', ext_covidspeak_image_only: true},
    {id: 7, label: "klmno", load_board: {id: 'keyboard5'}, image_id: 'i7', ext_covidspeak_image_only: true},
    {id: 8, label: "pqrst", load_board: {id: 'keyboard6'}, image_id: 'i8', ext_covidspeak_image_only: true},
  ], images: [
    {id: 'i1', url: "/keyboard/abcde.png", ext_covidspeak_alt_url: "/keyboard/alt-abcde.png"},
    {id: 'i3', url: "/keyboard/uvwxyz.png", ext_covidspeak_alt_url: "/keyboard/alt-uvwxyz.png"},
    {id: 'i4', url: "/keyboard/12345.png", ext_covidspeak_alt_url: "/keyboard/alt-12345.png"},
    {id: 'i5', url: "/keyboard/67890.png", ext_covidspeak_alt_url: "/keyboard/alt-67890.png"},
    {id: 'i6', url: "/keyboard/fghij.png", ext_covidspeak_alt_url: "/keyboard/alt-fghij.png"},
    {id: 'i7', url: "/keyboard/klmno.png", ext_covidspeak_alt_url: "/keyboard/alt-klmno.png"},
    {id: 'i8', url: "/keyboard/pqrst.png", ext_covidspeak_alt_url: "/keyboard/alt-pqrst.png"}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard2', name: 'keyboard2', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+a", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+e", ext_covidspeak_load_root: 'root'},
    {id: 4, label: ""},
    {id: 5, label: ""},
    {id: 6, label: "+b", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+c", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+d", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard3', name: 'keyboard3', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+1", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+5", ext_covidspeak_load_root: 'root'},
    {id: 4, label: "+space", ext_covidspeak_load_root: 'root'},
    {id: 5, label: "+backspace"},
    {id: 6, label: "+2", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+3", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+4", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard4', name: 'keyboard4', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+f", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+j", ext_covidspeak_load_root: 'root'},
    {id: 4, label: ""},
    {id: 5, label: ""},
    {id: 6, label: "+g", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+h", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+i", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard5', name: 'keyboard5', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+k", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+o", ext_covidspeak_load_root: 'root'},
    {id: 4, label: ""},
    {id: 5, label: ""},
    {id: 6, label: "+l", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+m", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+n", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard6', name: 'keyboard6', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+p", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+t", ext_covidspeak_load_root: 'root'},
    {id: 4, label: ""},
    {id: 5, label: ""},
    {id: 6, label: "+qu", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+r", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+s", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard7', name: 'keyboard7', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+6", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+0", ext_covidspeak_load_root: 'root'},
    {id: 4, label: "+."},
    {id: 5, label: "+?"},
    {id: 6, label: "+7", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+8", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+9", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
  {id: 'keyboard8', name: 'keyboard8', ext_covidspeak_skip: true, buttons: [
    {id: 1, label: "+u", ext_covidspeak_load_root: 'root'},
    {id: 2, label: "Go Back", ext_covidspeak_load_root: 'root'},
    {id: 3, label: "+z", ext_covidspeak_load_root: 'root'},
    {id: 4, label: "+v", ext_covidspeak_load_root: 'root'},
    {id: 5, label: ""},
    {id: 6, label: "+w", ext_covidspeak_load_root: 'root'},
    {id: 7, label: "+x", ext_covidspeak_load_root: 'root'},
    {id: 8, label: "+y", ext_covidspeak_load_root: 'root'}
  ], grid: {rows: 3, columns: 3, order: [[1, 2, 3], [4, null, 5], [6, 7, 8]], format: "open-board-0.1"}},
];
var parse_obf = function(obf) {
  var res = {};
  res.id = obf.id;
  res.data_url = obf.data_url;
  res.name = obf.name;
  res.skip = !!obf.ext_covidspeak_skip;
  res.buttons = [];
  res.image_url = obf.image_url || obf.ext_coughdrop_image_url || "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d7.svg";
  var buttons = {};
  obf.buttons.forEach(function(obf_button) {
    var button = {id: obf_button.id};
    button.text = obf_button.label;
    button.image_only = !!obf_button.ext_covidspeak_image_only;
    if(obf_button.load_board) {
      button.load_id = obf_button.load_board.data_url || obf_button.load_board.id;
    } else if(obf_button.label == 'Start Over' || obf_button.label == 'Go Back') {
      button.load_id = 'root';
    } else if(obf_button.ext_covidspeak_load_root) {
      button.load_id = 'root';
    }
    if(obf_button.image_id) {
      obf.images.forEach(function(obf_image) {
        if(obf_image.id == obf_button.image_id && obf_image.url) {
          button.image_url = obf_image.url;
        }
      });
    }
    buttons[button.id] = button;
  });
  if(obf.grid && obf.grid.rows >= 3 && obf.grid.columns >= 3) {
    res.buttons[0] = buttons[obf.grid.order[0][0]] || {id: 1000, text: ""};
    res.buttons[1] = buttons[obf.grid.order[0][1]];
    res.buttons[2] = buttons[obf.grid.order[0][2]] || {id: 1222, text: ""};
    res.buttons[3] = buttons[obf.grid.order[1][0]] || {id: 1333, text: ""};
    // no image on top middle
    if(res.buttons[1]) {
      res.buttons[1].image_url = "";
    } else {
      res.buttons[1] = {id: 1111, text: "Start Over", load_id: 'root'};
    }
    res.buttons[4] = buttons[obf.grid.order[1][2]] || {id: 1444, text: ""};
    res.buttons[5] = buttons[obf.grid.order[2][0]] || {id: 1555, text: ""};
    res.buttons[6] = buttons[obf.grid.order[2][1]] || {id: 1666, text: ""};
    res.buttons[7] = buttons[obf.grid.order[2][2]] || {id: 1777, text: ""};
    return res;
  } else {
    return null;
  }
};
boards = {grids: []};
obfs.forEach(function(obf) {
  boards.grids.push(parse_obf(obf));
})
var default_grid = parse_obf(default_obf);
boards.grids.push(default_grid);
var default_buttons = default_grid.buttons;

boards.refresh = function() {
  boards.original_grids = boards.original_grids || boards.grids;
  // reset the list so we start consistently
  boards.grids = boards.original_grids;
  var settings = {};
  try {
    settings = JSON.parse(localStorage.grid_settings || "{}");
  } catch(e) { }
  var hash = {};
  var grid_urls = [];
  // .uniq
  (settings.grid_urls || []).forEach(function(url) {
    if(!hash[url]) {
      hash[url] = true;
      grid_urls.push(url);
    }
  });
  // add stored grids one by one
  var next_url = function() {
    var url = grid_urls.shift();
    if(url) {
      boards.add_url(url).then(function(res) {
        next_url();
      }, function(err) {
        next_url();
       });
    } else {
      room.populate_grids();
    }
  };
  setTimeout(function() {
    next_url();
  }, 10);
};
boards.export_grids = function() {
  var grid_urls = [];
  var list = [].concat(boards.grids || []);
  list.reverse().forEach(function(grid) {
    var url = grid.data_url || grid.id;
    if(!grid.skip && grid_urls.indexOf(url) == -1) {
      grid_urls.push(url);
    }
  });

  return "grids://" + btoa(JSON.stringify(grid_urls));
};
boards.persist = function(grid_urls) {
  var settings = {};
  try {
    settings = JSON.parse(localStorage.grid_settings || "{}");
  } catch(e) { }
  if(!grid_urls) {
    grid_urls = [];
    var list = [].concat(boards.grids || []);
    list.reverse().forEach(function(grid) {
      if(!grid.skip) {
        grid_urls.push(grid.data_url || grid.id);
      }
    });
  }
  settings.set_at = (new Date()).getTime();
  settings.grid_urls = grid_urls;
  localStorage.grid_settings = JSON.stringify(settings);  
};
boards.find_url = function(url) {
  return new Promise(function(res, rej) {
    var match = url.match(/http(s:\/\/app\.mycoughdrop\.com|:\/\/localhost[^\/]+)\/([^\/]+\/[^\/]+)$/);
    if(match) {
      var key = match[2];
      url = url.replace(key, "api/v1/boards/" + key + "/simple.obf");
    }
    if(boards.cached_urls && boards.cached_urls[url]) {
      return res(boards.cached_urls[url]);
    }
    session.ajax(url, { method: "GET" }).then(function(obf) {
      var grid = parse_obf(obf);
      if(grid) {
        grid.download_url = url;
        boards.cached_urls = boards.cached_urls || {};
        boards.cached_urls[url] = grid;
        res(grid);
      } else {
        console.log("Could not import board, invalid grid", url, obf);
        rej({error: 'invalid_grid'});
      }
    }, function(err) {
      rej(err);
    });
  });
};
boards.remove_url = function(url) {
  if(boards.cached_urls && boards.cached_urls[url]) {
    boards.grids = boards.grids.filter(function(g) { return g.download_url != url; })
    boards.persist();
    room.populate_grids();
  }
};
boards.shift = function(url, direction) {
  var found = boards.grids.find(function(g) { return !g.skip && (g.id == url || g.data_url == url); });
  if(found) {
    var skips = boards.grids.filter(function(g) { return g.skip; });
    var actives = boards.grids.filter(function(g) { return !g.skip; });
    var idx = actives.indexOf(found);
    var pre = actives.slice(0, idx);
    var post = actives.slice(idx + 1);
    if(direction == 'up') {
      var other_move = pre.pop();
      if(other_move) {
        post.unshift(other_move);
      }
      pre.push(found);
    } else if(direction == 'down') {
      var other_move = post.shift();
      if(other_move) {
        pre.push(other_move);
      }
      post.unshift(found);
    }
    boards.grids = pre.concat(post).concat(skips);
    boards.persist();
    room.populate_grids();
  }
};
boards.add_url = function(url, save) {
  return new Promise(function(res, rej) {
    // if a grid list, populate them all
    url = url.replace(/^\s+/, '').replace(/\s+$/, '');
    if(url.match(/^grids:\/\//)) {
      var list = null;
      try {
        list = JSON.parse(atob(url.replace(/^grids:\/\//, '')));
      } catch(e) { }
      if(list) {
        boards.persist(list);
        boards.refresh();
        return res({list: list});
      } else {
        return rej({error: "invalid_grid_url"});
      }
    }
    // if already there, remove the prior instance
    var existing = boards.grids.find(function(g) { return g.id == url || g.data_url == url; });
    if(existing) {
      boards.grids = boards.grids.filter(function(g) { return g != existing; });
      boards.grids.unshift(existing);
      res(existing);
    } else {
      boards.find_url(url).then(function(grid) {
        boards.grids.unshift(grid);
        boards.personalized = true;
        if(save) {
          boards.persist();
          room.populate_grids();
        }
        res(grid);
      }, function(err) {
        console.log("Failed to import board", url, err)
        rej(err);
      });  
    }
  });
};

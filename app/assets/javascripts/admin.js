var tz_offset = (new Date()).getTimezoneOffset() * 60 * 1000
var process_room = function(room) {
  var started = (new Date(room.started * 1000 - tz_offset)).toISOString().substring(5, 16).replace(/T/, ' ');

  var duration = room.duration + "s";
  if(room.duration == 0) {
    if(room.partner_status == 'attempted') {
      duration = "attempted";
    } else if(room.partner_status == 'waiting_room') {
      duration = "never left waiting room";
    } else if(room.partner_status == 'connected') {
      duration = "temporarily connected";
    } else {
      duration = "never connected";
    }
  } else if(room.duration > 3600) {
    duration = (Math.round(room.duration * 10 / 60 / 60) / 10) + "h";
  } else if(room.duration > 60) {
    duration = (Math.round(room.duration * 10 / 60) / 10) + "m";
  }
  if(room.total_users > 0) {
    duration = duration + " (" + room.total_users + " users)";
  }
  room.started_string = started;
  room.duration_string = duration;
  return room;
}
var process_account = function(account) {
  var code = account.code;
  if(account.sub_codes) {
    code = code + " (allows sub-codes)";
  }
  var target = account.type;
  if(target == 'webrtc') {
    if(account.source == 'twilio') {
      target = 'webrtc (' + account.source + ')';
    } else {
      target = 'webrtc (' + account.address + ')';
    }
  }
  account.code_string = code;
  account.target = target;
  if(account.last_room_at) {
    var date = new Date(account.last_room_at * 1000);
    account.last_room_string = date.toDateString();
  }
  if(account.recent_rooms_approx) {
    account.recent_rooms = "~" + account.recent_rooms_approx;
  }
  return account;
}
var admin = {
  login_prompt: function(str) {
    admin.show_view('login');
    document.querySelector('#login .prompt').innerText = str;
  },
  show_view: function(view) {
    document.querySelectorAll('.admin_view').forEach(function(view) {
      view.style.display = 'none';
    })
    document.querySelector('.admin_view#' + view).style.display = 'block';
    if(view == 'accounts') {
      admin.reload_accounts();
    }
  },
  create_account: function(data) {
    return new Promise(function(resolve, reject) {
      session.ajax("/api/v1/accounts", {type: 'POST', data: data}).then(function(result) {
        resolve(result.account);
      }, function(err) {
        reject(err);
      })
    });
  },
  generate_sub_id: function(id) {
    return new Promise(function(resolve, reject) {
      if(!admin.current_account) {
        return reject({error: 'account not loaded'});
      }
      session.ajax("/api/v1/accounts/" + admin.current_account.id + "/sub_ids", {type: 'POST', data: {sub_id: id || ''}}).then(function(data) {
        admin.load_account(admin.current_account.id);
        resolve({sub_id: data.sub_id, full_code: admin.current_account.code + "." + data.sub_id});
      }, function(err) {
        reject(err);
      });
    });
  },
  set_state: function(hash) {
    if(hash == '#' && location.hash == '') { 
      hash = ''; 
      admin.hashstate = '#';
    }
    if(location.hash != hash) {
      admin.hashstate = hash;
      window.location = admin.hashstate;
    }
  },
  load_account: function(account_id) {
    session.ajax("/api/v1/accounts/" + account_id, {type: 'GET'}).then(function(data) {
      var account = data.account;
      admin.set_state("#account:" + account.id);
      process_account(account);

      var content = document.querySelector('#account');
      if(account.sub_codes) {
        content.querySelector('.sub_codes').innerText = "";
        for(var key in (account.sub_ids || {})) {
          var link = document.createElement('a');
          link.style.display = 'block';
          link.href = "/?join=" + account.code + "." + key;
          var exp = 'permanent';
          if(account.sub_ids[key] != 'permanent') {
            var date = new Date(account.sub_ids[key] * 1000 - tz_offset);
            exp = date.toISOString().substring(0, 10);
          }
          link.innerText = key + " (" + exp + ")";
          content.querySelector('.sub_codes').appendChild(link);
        }
        content.querySelector('#generate_sub_code').style.display = 'block';
      } else {
        content.querySelector('.sub_codes').innerText = "Not Available";
        content.querySelector('#generate_sub_code').style.display = 'none';
      }

      admin.current_account = account;
      admin.show_view('account');
      extras.populate(content, {
        name: account.name,
        code: account.code_string,
        target: account.target,
        last_room: account.last_room_string,
        recent_rooms: account.recent_rooms,
        contact_name: account.contact_name,
        contact_email: account.contact_email,
        "-max_concurrent_rooms": account.max_concurrent_rooms,
        "-max_concurrent_rooms_per_user": account.max_concurrent_rooms,
        "-max_daily_rooms": account.max_daily_rooms,
        "-max_daily_rooms_per_user": account.max_daily_rooms_per_user,
        "-max_monthly_rooms": account.max_monthly_rooms,
        "-max_monthly_rooms_per_user": account.max_monthly_rooms_per_user,
        "-max_concurrent_rooms_dt": account.max_concurrent_rooms,
        "-max_concurrent_rooms_per_user_dt": account.max_concurrent_rooms,
        "-max_daily_rooms_dt": account.max_daily_rooms,
        "-max_daily_rooms_per_user_dt": account.max_daily_rooms_per_user,
        "-max_monthly_rooms_dt": account.max_monthly_rooms,
        "-max_monthly_rooms_per_user_dt": account.max_monthly_rooms_per_user,
      });
      content.querySelectorAll('.rooms .room').forEach(function(room) {
        if(!room.classList.contains('template')) {
          room.parentNode.removeChild(room);
        }
      });
      if(account.rooms) {
        var template = content.querySelector('.rooms .room.template');
        account.rooms = account.rooms.sort(function(a, b) { return b.started - a.started; })
        account.rooms.forEach(function(room) {
          var elem = template.cloneNode(true);
          elem.classList.remove('template');
          process_room(room);
          (room.configs || []).forEach(function(config) {
            var div = document.createElement('div');
            div.innerText = config;
            elem.querySelector('.devices').appendChild(div);
          });
          extras.populate(elem, {
            started: room.started_string,
            duration: room.duration_string,
            "-sub_id": room.sub_id ? ("(" + room.sub_id + ")") : ""
          });
          content.querySelector('.rooms').appendChild(elem);
        });
      }  
    }, function(err) {

    });
  },
  reload_accounts: function() {
    document.querySelectorAll("#accounts .list .account").forEach(function(account) {
      if(!account.classList.contains('template')) {
        account.parentNode.removeChild(account);
      }
    });
    document.querySelector("#accounts .list .status").innerText = "Loading Accounts...";
    session.ajax("/api/v1/accounts", {type: 'GET'}).then(function(data) {
      document.querySelector("#accounts .status").innerText = "";
      var template = document.querySelector("#accounts .list .account.template");
      data.accounts = data.accounts.sort(function(a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
      data.accounts.forEach(function(account) {
        var elem = template.cloneNode(true);
        process_account(account);
        extras.populate(elem, {
          name: account.name,
          code: account.code_string,
          last_room: account.last_room_string,
          "-recent_rooms": account.recent_rooms,
          target: account.target
        })
        elem.addEventListener('click', function(event) {
          if(event.target.closest('.code')) {
            // let people copy and paste the code
          } else {
            event.preventDefault();
            admin.load_account(account.id);
          }
        });
        elem.classList.remove('template');
        document.querySelector("#accounts .list").appendChild(elem);
      });
      if(data.recent_rooms) {
        document.querySelectorAll('#accounts .rooms .room').forEach(function(room) {
          if(!room.classList.contains('template')) {
            room.parentNode.removeChild(room);
          }
        });
        var template = document.querySelector('#accounts .rooms .room.template');
        data.recent_rooms.forEach(function(room) {
          var elem = template.cloneNode(true);
          elem.classList.remove('template');
          elem.style.display = 'block';
          elem.querySelector('a.code').href = '#account:' + room.account_id;
          elem.querySelector('a.code').addEventListener('click', function(event) {
            event.preventDefault();
            admin.load_account(room.account_id);
          });
          process_room(room);
          extras.populate(elem, {
            code: room.account_code,
            name: room.account_name,
            started: room.started_string,
            duration: room.duration_string,
            "-sub_id": room.sub_id ? ("(" + room.sub_id + ")") : ""
          });
          document.querySelector('#accounts .rooms').appendChild(elem);
        });
      }
    }, function(err) {
      document.querySelector("#accounts .status").innerText = "Error Loading Accounts";

    });
  },
  show_logout: function() {
    if(!document.querySelector('header he2.logout')) {
      var elem = document.createElement('h2');
      elem.classList.add('header_link');
      elem.classList.add('logout');
      if(document.querySelector("header h2.header_link")) {
        var remove = document.querySelector("header h2.header_link");
        remove.parentNode.removeChild(remove);
      }
      var a = document.createElement('a');
      a.innerText = 'Logout';
      a.href = "#";
      elem.appendChild(a);
      a.addEventListener('click', function(event) {
        localStorage.removeItem('access_token');
        location.reload();
      });
      document.querySelector("header").appendChild(elem);
    }
  },
  login: function(code) {
    return new Promise(function(res, rej) {
      session.ajax("/api/v1/tokens", {type: 'POST', data: {code: code}}).then(function(data) {
        localStorage.access_token = data.access_token;
        session.token_validated = true;
        admin.show_logout();
        res(data.token);
      }, function(err) {
        rej(err);
      });
    });
  },
  check_token: function() {
    return new Promise(function(res, rej) {
      var token = localStorage.access_token;
      if(!token) {
        return rej({error: 'no token'});
      }
      session.ajax("/api/v1/tokens/check", {type: 'GET', data: {token: token}}).then(function(data) {
        if(data && data.valid) {
          session.token_validated = true;
          admin.show_logout();
          res(token);  
        } else {
          rej({error: 'invalid token'});
        }
      }, function(err) {
        rej(err);
      })
    });
    
  }
};
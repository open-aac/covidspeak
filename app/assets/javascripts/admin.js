var tz_offset = (new Date()).getTimezoneOffset() * 60 * 1000
var process_room = function(room) {
  var started = window.moment(room.started * 1000).format('D MMM h:mma')

  var duration = room.duration + "s";
  if(room.duration == 0) {
    if(room.partner_status == 'attempted') {
      duration = "attempted";
    } else if(room.partner_status == 'invited') {
      duration = "invited";
    } else if(room.partner_status == 'invite_modal') {
      duration = "invite copied";
    } else if(room.partner_status == 'ready_to_enter') {
      duration = "never left waiting room";
    } else if(room.partner_status == 'training') {
      duration = "stuck at training";
    } else if(room.partner_status == 'connected') {
      duration = "temporarily connected";
    } else if(room.partner_status == 'connecting') {
      duration = "tried to connect";
    } else if(room.partner_status == 'pending_waiting_room') {
      duration = "pending waiting room only";
    } else {
      room.unused = true;
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
  if(account.beta) {
    target = "BETA " + target;
  }
  if(account.payment_type == 'paid') {
    if(account.can_start_room) {
      account.purchase_state = "Active";
      if(account.payment_frequency == 'monthly') {
        account.purchase_state = account.purchase_state + " (monthly)";
      } else if(account.payment_frequency == 'yearly') {
        account.purchase_state = account.purchase_state + " (yearly)";
      }
    } else {
      account.purchase_state = "Canceled";
    }
  } else {
    if(account.demo) {
      account.purchase_state = "Demo";
    } else {
      account.purchase_state = "Free";
    }
  }
  account.code_string = code;
  account.target = target;
  account.created_string = window.moment(account.created_at).format('D MMM, YYYY');
  if(account.last_room_at) {
    var date = new Date(account.last_room_at * 1000);
    var recent_cutoff = window.moment().add(-30, 'day')._d;
    if(date > recent_cutoff) {
      account.recent_activity = true;
    }
    var current_year = (new Date()).getFullYear();
    account.last_room_string = date.toDateString().replace(current_year.toString(), '');

  }
  if(account.last_meter_update) {
    account.last_meter_string = window.moment(account.last_meter_update).format('MMM YYYY');
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
    } else if(view == 'feedback') {
      admin.load_feedback();
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
  load_account: function(account_id, account_code) {
    session.ajax("/api/v1/accounts/" + account_id, {type: 'GET', data: {admin_code: account_code}}).then(function(data) {
      var account = data.account;
      if(!account_code) {
        admin.set_state("#account:" + account.id);
      }
      process_account(account);

      var content = document.querySelector('#account');
      if(!account_code) {
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
      }
      extras.populate(content, {
        name: account.name,
        code: account.code_string,
        target: account.target,
        last_room: account.last_room_string,
        recent_rooms: account.recent_rooms,
        contact_name: account.contact_name,
        contact_email: account.contact_email,
        cancel_reason: account.cancel_reason,
        created_string: account.created_string,
        "--cancel_reason_parent": !!account.cancel_reason,
        purchase_state: account.purchase_state,
        "--purchase_summary_parent": !!(account.payment_type == 'paid' && account.can_start_room),
        "-max_concurrent_rooms": account.max_concurrent_rooms,
        "-max_concurrent_rooms_per_user": account.max_concurrent_rooms,
        "-max_daily_rooms": account.max_daily_rooms,
        "-max_daily_rooms_per_user": account.max_daily_rooms_per_user,
        "-max_monthly_rooms": account.max_monthly_rooms,
        "-max_monthly_rooms_per_user": account.max_monthly_rooms_per_user,
        "-last_meter": account.last_meter_string,
        "--max_concurrent_rooms_dt": account.max_concurrent_rooms,
        "--max_concurrent_rooms_per_user_dt": account.max_concurrent_rooms,
        "--max_daily_rooms_dt": account.max_daily_rooms,
        "--max_daily_rooms_per_user_dt": account.max_daily_rooms_per_user,
        "--max_monthly_rooms_dt": account.max_monthly_rooms,
        "--max_monthly_rooms_per_user_dt": account.max_monthly_rooms_per_user,
        "--last_meter_dt": account.last_meter_string,
      });
      if(content.querySelector('.past_due')) {
        content.querySelector('.past_due').style.display = account.past_due ? 'block' : 'none';
      }
      if(content.querySelector('.join_link')) {
        content.querySelector('.join_link').setAttribute('href', "/?join=" + account.code);
      }
      content.querySelectorAll('.rooms .room').forEach(function(room) {
        if(!room.classList.contains('template')) {
          room.parentNode.removeChild(room);
        }
      });
      content.querySelectorAll('.bills .bill').forEach(function(room) {
        if(!room.classList.contains('template')) {
          room.parentNode.removeChild(room);
        }
      });
      if(account.history) {
        var template = content.querySelector('.bills .bill.template');
        if(template) {
          account.history.forEach(function(month) {
            var elem = template.cloneNode(true);
            elem.classList.remove('template');
            var billing_string = month.billed ? "billed" : "not billed";
            if(account.payment_frequency == 'yearly') { 
              billing_string = '';
            }
            extras.populate(elem, {
              month: month.month,
              minutes: (month.minutes || 0).toLocaleString(),
              rooms: month.rooms,
              billing_string: billing_string
            });
            content.querySelector('.bills').appendChild(elem);
          });
        }
      }
      if(account.admin_code && document.querySelector(".manage_link")) {
        document.querySelector(".manage_link").setAttribute('href', "/accounts/" + account.admin_code);
      }
      if(account.rooms) {
        var template = content.querySelector('.rooms .room.template');
        account.rooms = account.rooms.sort(function(a, b) { return b.started - a.started; })
        if(account.rooms.length == 0) {
          var div = document.createElement('div');
          div.classList.add('room');
          div.classList.add('status');
          div.innerText = "No Recent Rooms";
          content.querySelector('.rooms').appendChild(div);
        }
        account.rooms.forEach(function(room) {
          var elem = template.cloneNode(true);
          elem.classList.remove('template');
          process_room(room);
          (room.configs || []).forEach(function(config, idx) {
            var div = document.createElement('div');
            div.innerText = config;
            if(room.connections && room.connections[idx]) {
              div.innerText = div.innerText + " (" + room.connections[idx] + ")";
            }
            elem.querySelector('.devices').appendChild(div);
            if(room.actions && room.actions[idx]) {
              var sub = document.createElement('div');
              sub.classList.add('actions');
              sub.innerText =  (room.actions[idx].buttons || 0) + " buttons, " + (room.actions[idx].reactions || 0) + " reactions, " + (room.actions[idx].minutes_heard || 0) + "m audio";
              div.appendChild(sub);
            }
          });
          if(room.unused) {
            elem.classList.add('unused');
          }
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
  load_feedback: function() {
    admin.set_state("#feedback");
    if(admin.loading_feedback) { return; }
    admin.loading_feedback = true;
    document.querySelectorAll("#feedback .list .feedback").forEach(function(elem) {
      if(!elem.classList.contains('template')) {
        elem.parentNode.removeChild(elem);
      }
    });

    session.ajax("/api/v1/feedback", {type: 'GET'}).then(function(data) {
      admin.loading_feedback = false;
      var template = document.querySelector("#feedback .list .feedback.template");
      data.feedback.forEach(function(feedback) {
        var elem = template.cloneNode(true);
        elem.classList.remove('template');
        // process_feedback(feedback);
        elem.classList.add('stars_' + feedback.stars);
        var date = new Date(feedback.created * 1000);
        var date_string = window.moment(date).calendar(); //.format('D MMM h:mma');
  
        extras.populate(elem, {
          created: date_string,
          text: feedback.feedback,
          device: feedback.device
        });
        document.querySelector("#feedback .list").appendChild(elem);
      });
    }, function() {
      admin.loading_feedback = false;
    });
  },
  reload_accounts: function() {
    if(admin.reloading_accounts) { return; }
    admin.reloading_accounts = true;
    document.querySelectorAll("#accounts .list .account").forEach(function(account) {
      if(!account.classList.contains('template')) {
        account.parentNode.removeChild(account);
      }
    });
    document.querySelector("#accounts .list .status").innerText = "Loading Accounts...";
    session.ajax("/api/v1/accounts", {type: 'GET'}).then(function(data) {
      admin.reloading_accounts = false;
      document.querySelectorAll("#accounts .list .account").forEach(function(account) {
        if(!account.classList.contains('template')) {
          account.parentNode.removeChild(account);
        }
      });
      document.querySelector("#accounts .status").innerText = "";
      var template = document.querySelector("#accounts .list .account.template");
      data.accounts = data.accounts.sort(function(a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
      var recent_accounts = 0;
      var billable_slots = 0;
      var paid_accounts = 0;
      var prepaid_slots = 0;
      var billed_slots = 0;
      data.accounts.forEach(function(account) {
        var elem = template.cloneNode(true);
        process_account(account);
        if(account.payment_type == 'paid' && account.payment_frequency == 'monthly') {
          paid_accounts++;
          billable_slots = billable_slots + (account.max_concurrent_rooms || 1);
        }
        if(account.payment_type == 'paid' && account.payment_frequency == 'yearly') {
          prepaid_slots = prepaid_slots + (account.max_concurrent_rooms || 1);
        }
        if(account.recent_activity) {
          recent_accounts++;
          if(account.current_month_meter) {
            billed_slots = billed_slots + (account.max_concurrent_rooms || 1);
          }
        }
        extras.populate(elem, {
          name: account.name,
          code: account.code_string,
          last_room: account.last_room_string,
          "-recent_rooms": account.recent_rooms,
          target: account.target
        })
        if(elem.querySelector('.billing_type img')) {
          if(account.payment_type == 'paid') {
            if(account.can_start_room) {
              elem.querySelector('.billing_type img').src = "/icons/cart-check.svg";
            } else {
              elem.querySelector('.billing_type img').src = "/icons/cart-dash.svg";
            }
          }
        }
        if(account.recent_activity) {
          elem.classList.add('recent');
          if(account.current_month_meter) {
            elem.classList.add('billed');
          }
        }
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
      if(prepaid_slots > 0) {
        paid_accounts = (paid_accounts || 'None') + " (" + prepaid_slots + " prepaid)";
      }

      (document.querySelector('#accounts .recent_accounts') || {}).innerText = recent_accounts || 'None';
      (document.querySelector('#accounts .paid_accounts') || {}).innerText = paid_accounts || 'None';
      (document.querySelector('#accounts .billed_rooms') || {}).innerText = billable_slots ? (billed_slots + " / " + billable_slots) : "N/A";

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
          var hardest_connection = null;
          (room.connections || []).forEach(function(conn) {
            if(conn) {
              hardest_connection = hardest_connection || conn;
              if(hardest_connection != 'TURN' && conn == 'TURN') {
                hardest_connection = conn;
              } else if(hardest_connection == 'local' && conn == 'STUN') {
                hardest_connection = conn;
              }
            }
          });
          if(hardest_connection) {
            room.duration_string = room.duration_string + " (" + hardest_connection + ")";
          }

          extras.populate(elem, {
            code: room.account_code,
            name: room.account_name,
            started: room.started_string,
            duration: room.duration_string,
            "-sub_id": room.sub_id ? ("(" + room.sub_id + ")") : ""
          });

          if(room.unused) {
            elem.classList.add('unused');
          }
          document.querySelector('#accounts .rooms').appendChild(elem);
        });
      }
    }, function(err) {
      document.querySelector("#accounts .status").innerText = "Error Loading Accounts";
      admin.reloading_accounts = false;
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
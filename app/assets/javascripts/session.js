var session = {
  ajax: function(url, opts) {
    opts.url = url;
    opts.dataType = opts.dataType || 'json';
    if(localStorage.access_token && session.token_validated) {
      opts.headers = opts.headers || {};
      opts.headers['Authorization'] = "Bearer " + localStorage.access_token;
    }
    return $.ajax(opts);
  },
  join_room: function(opts, callback) {
    return new Promise(function(res, rej) {
      session.subscriptions = session.subscriptions || {};
      if(session.subscriptions[opts.room_id]) {
        session.subscriptions[opts.room_id].unsubscribe();
      }
      opts.channel = 'RoomChannel';
      var subscription = session.cable.subscriptions.create(opts, {
        received: function(data) {
          callback(data);
        },
        connected: function() {
          res();
        },
        rejected: function() {
          rej();
        }
      });
      session.subscriptions[opts.room_id] = subscription;  
    });
  },
  support_message: function(message, subject, name, email) {
    var data = {
      system: input.compat.system,
      browser: input.compat.browser,
      mobile: !!input.compat.mobile,
      message: message,
      subject: subject,
      name: name,
      email: email
    };
    if(room.current_room && room.current_room.id) {
      data.room_id = room.current_room.id;
    }
    return session.ajax('/api/v1/support', {
      type: 'POST',
      data: data
    });
  },
  send_to_room(room_id, message) {
    session.subscriptions = session.subscriptions || {};
    if(session.subscriptions[room_id]) {
      session.subscriptions[room_id].send(message);
      return true;
    } else {
      return false;
    }
  }
};

session.cable = ActionCable.createConsumer("/cable");
var session = {
  ajax: function(url, opts) {
    opts.url = url;
    opts.dataType = opts.dataType || 'json';
    if(localStorage.auth_token) {
      opts.headers = opts.headers || {};
      opts.headers['Authorization'] = localStorage.auth_token;
    }
    return $.ajax(opts);
  },
  join_room: function(opts, callback) {
    session.subscriptions = session.subscriptions || {};
    if(session.subscriptions[opts.room_id]) {
      session.subscriptions[opts.room_id].unsubscribe();
    }
    opts.channel = 'RoomChannel';
    var subscription = session.cable.subscriptions.create(opts, {
      received: function(data) {
        callback(data);
      }
    });
    session.subscriptions[opts.room_id] = subscription;
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
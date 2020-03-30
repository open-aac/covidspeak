var session = {
  ajax: function(url, opts) {
    opts.url = url;
    opts.dataType = opts.dataType || 'json';
    if(localStorage.auth_token) {
      opts.headers = opts.headers || {};
      opts.headers['Authorization'] = localStorage.auth_token;
    }
    return $.ajax(opts);
  }
};
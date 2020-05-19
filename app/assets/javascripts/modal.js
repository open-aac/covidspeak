var modal = {
  open: function(title, dom, actions) {
    modal.close(true);
    var result = new Promise(function(res, rej) {
      var defer = {
        resolve: function(data) {
          if(!modal.defer.completed) {
            modal.defer.completed = true;
            res(data);  
          }
        },
        reject: function(data) {
          if(!modal.defer.completed) {
            modal.defer.completed = true;
            rej(data);  
          }
        }
      };
      modal.defer = defer;
      var modal_elem = document.createElement('div');
      modal_elem.classList.add('modal');
      var modal_content = document.createElement('div');
      modal_content.classList.add('modal_content');
      var title_elem = document.createElement('div');
      title_elem.classList.add('title');
      title_elem.innerText = title;
      var a = document.createElement('a');
      a.classList.add('close');
      a.innerText = "×";
      title_elem.appendChild(a);
      modal_content.appendChild(title_elem);
      var content = dom.cloneNode(true);
      dom.cloned_content = content;
      modal_content.appendChild(content);
      actions = actions || [];
      if(!actions.find(function(a) { return a.action == 'close'; })) {
        actions.push({action: "close", label: "Close"});
      }
      var footer = document.createElement('div');
      footer.classList.add('modal_footer');
      actions.forEach(function(action) {
        var elem = document.createElement('button');
        elem.classList.add('modal_button');
        elem.innerText = action.label;
        if(action.icon) {
          var img = document.createElement('img');
          img.src = "/icons/" + action.icon + ".svg";
          elem.prepend(img);
        }
        elem.action = action;
        footer.appendChild(elem);
      });
      modal_content.appendChild(footer);
      modal_elem.appendChild(modal_content);
      document.body.appendChild(modal_elem);
    });
    result.then(null, function() { });
    if(dom.onattached && dom.cloned_content) {
      dom.onattached(dom.cloned_content);
      dom.onattached = null;
    }
    return result;
  },
  close: function(force) {
    var modals = document.getElementsByClassName('modal');
    for(var idx = 0; idx < modals.length; idx++) {
      if(modals[idx].parentNode == document.body) {
        modals[idx].parentNode.removeChild(modals[idx]);
      }
    }
    if(modal.defer) {
      modal.defer.reject({closed: true, forced: force});
    }
  },
  note: function(str, opts) {
    var alert = document.createElement('div');
    alert.classList.add('big_alert');
    alert.innerText = str;
    if(opts && opts.error) {
      alert.classList.add('error');
    }
    document.body.appendChild(alert);
    setTimeout(function() {
      alert.classList.add('ready');
    }, 100);
    setTimeout(function() {
      alert.classList.remove('ready');
    }, 6000);
    setTimeout(function() {
      if(alert.parentNode) {
       alert.parentNode.removeChild(alert);;
      }
    }, 7000);
  }
};
document.addEventListener('click', function(event) {
  if(event.target.classList.contains('close')) {
    if($(event.target).closest('.modal').length > 0) {
      modal.close();
    }
  } else if(event.target.closest('.modal_button')) {
    if(event.target.closest('.modal_footer')) {
      var action = event.target.closest('.modal_button').action;
      if(!action) {
        modal.close(true);
      } else if(action.callback) {
        action.callback();
      } else {
        modal.close();
      }
    }
  }
})
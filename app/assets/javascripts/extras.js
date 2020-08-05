var extras = {
  populate: function(dom, lookups) {
    for(var key in lookups) {
      var query = key;
      var hide_if_blank = false;
      var do_populate = true;
      if(key.match(/^--/)) {
        query = key.substring(2);
        hide_if_blank = true;
        do_populate = false;
      } else if(key.match(/^-/)) {
        query = key.substring(1);
        hide_if_blank = true;
      }
      var sub = dom.querySelector('.' + query);
      if(sub && lookups[key] != null && do_populate) {
        sub.innerText = lookups[key];
        sub.style.display = '';
      } else if(sub && hide_if_blank) {
        if(lookups[key] == null || lookups[key] == false) {
          sub.style.display = 'none';
        } else {
          sub.style.display = '';          
        }
      }
    }
  },
  copy: function(url) {
    return new Promise(function(res, rej) {
      setTimeout(function() {
        var link = document.querySelector('#copy_link');  
        if(!link) {
          link = document.createElement('a');
          link.style.position = 'absolute';
          link.style.left = '-2000px';
          link.id = 'copy_link';
          document.body.appendChild(link);
        }
        link.href = url;
        link.innerText = url;
        var range = document.createRange();  
        range.selectNode(link);  
        window.getSelection().addRange(range);  
  
        try {  
          // Now that we've selected the anchor text, execute the copy command  
          var successful = document.execCommand('copy');  
          var msg = successful ? 'successful' : 'unsuccessful';  
          console.log('Copy command was ' + msg);  
          if(successful) {
            res({copied: true});
          } else {
            res({copied: false});
          }
        } catch(err) { 
          rej(err);
          alert("Copy failed unexpectedly");
        }
        window.getSelection().removeAllRanges();   
      }, 300);
    });
  }
};
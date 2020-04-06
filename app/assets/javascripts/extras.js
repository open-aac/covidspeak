var extras = {
  copy: function(url) {
    return new Promise(function(res, rej) {
      var link = document.querySelector('#copy_link');  
      if(!link) {
        link = document.createElement('a');
        link.style.position = 'absolute';
        link.style.left = '-1000px';
        document.body.appendChild(link);
      }
      link.innerText = url;
      var range = document.createRange();  
      range.selectNode(link);  
      window.getSelection().addRange(range);  

      try {  
        // Now that we've selected the anchor text, execute the copy command  
        var successful = document.execCommand('copy');  
        var msg = successful ? 'successful' : 'unsuccessful';  
        console.log('Copy email command was ' + msg);  
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
    });
  }
};
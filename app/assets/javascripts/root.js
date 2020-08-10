var help_modal = null;
(function() {
  help_modal = function(popout) {
    var dom = document.querySelector('#help_modal');
    dom.onattached = function(dom) {
      dom.querySelector('#form').addEventListener('submit', function(event) {
        event.preventDefault();
        var msg = dom.querySelector('#form .message').value;
        var subj = dom.querySelector('#form .subject').value;
        var name = dom.querySelector('#form .name').value;
        var email = dom.querySelector('#form .email').value;
        if(email && msg) {
          dom.querySelector('#form .submit').innerText = "Sending Message...";
          session.support_message(msg, subj, name, email).then(function(res) {
            if(res && res.success) {
              dom.querySelector('#form .submit').innerText = "Message Sent! Thank You!";
              setTimeout(function() {
                modal.close();
              }, 2000);
            } else {
              dom.querySelector('#form .submit').innerText = "Error Sending Message";
            }
          }, function(err) {
            dom.querySelector('#form .submit').innerText = "Error Sending Message";
          });  
        }
      });
      
      dom.querySelector('#ticket').addEventListener('click', function(event) {
        event.preventDefault();
        dom.querySelector('#buttons').style.display = 'none';
        dom.querySelector('#form').style.display = 'block';
      });
      dom.querySelector('#intro').addEventListener('click', function(event) {
        event.preventDefault();
        modal.close();
        if(popout) {
          window.open('/intro', '_blank');
        } else {
          location.href = '/intro';
        }
      });
      dom.querySelector('#faq').addEventListener('click', function(event) {
        event.preventDefault();
        modal.close();
        window.open('https://www.covidspeak.org/faq.html', '_blank');
      });
    };
    modal.open('Co-VidSpeak Help', dom);
  }
  document.addEventListener('click', function(event) {
    if(event.target.closest('#help')) {
      event.preventDefault();
      help_modal();
    }
  });
})();
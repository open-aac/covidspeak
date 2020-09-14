var custom_track = null;
(function() {
  custom_track = {
    process_book: function(book, initiator, callback) {
      if(custom_track.last_processed && custom_track.last_processed.type == 'book' && custom_track.last_processed.share_id == book.share_id) {
        if(custom_track.last_processed.update) {
          custom_track.last_processed.update(book);
        }
        return custom_track.last_processed.track;
      }

      // TODO: if same as last-processed, use that
      // instead of re-creating
      var render_page = function(elem) {
        var page = book.pages[book.page];
        console.log("PAGE", page);

        Array.from(elem.querySelectorAll('text,img')).forEach(function(obj) {
          if(obj.parentNode.tagName != 'BUTTON') {
            obj.parentNode.removeChild(obj);
          }
        })

        var page_elem = elem.querySelector('.page');
        if(book.page && page && book.pages && book.pages.length) {
          page_elem.innerText = book.page + ' / ' + book.pages.length;
        } else {
          page_elem.innerText = '';
        }

        var partner = document.querySelector('#partner');
        var bounds = partner.getBoundingClientRect();
        var text_height = bounds.height * 0.3;
        var text_width = bounds.width;
        var canvas = document.createElement('canvas');
        canvas.width = text_width;
        canvas.height = text_height;
        var context = canvas.getContext('2d');
        var size = 30;

        var str = (page && page.text) || "All finished!";
        context.font = size + "px Arial";
        var max_text_width = context.measureText(str).width;
        var rows = 1;
        var max_lines = 4;
        var min_height = 14;
        var lines = [str];
        var stay_put = false;
        var trim_line = function(text, length) {
          var pre = length, post = length;
          while(text) {
            if(text.charAt(pre).match(/\s/)) {
              return [text.substring(0, pre), text.substring(pre + 1)];
            } else if(text.charAt(post).match(/\s/)) {
              return [text.substring(0, post), text.substring(post + 1)];
            } else if(pre <= 0 && post >= text.length) {
              return [text, ""];  
            } else {
              pre--;
              post++;
            }
          }
        }
        var size_ready = false;
        while(max_text_width > text_width && !size_ready) {
          // First, see if we can fit it by splitting it
          var lines = 1;
          while(max_text_width > text_width && lines < max_lines) {
            if(max_text_width > text_width) {
              lines++;
            }
            var subs = [];
            var leftover = str;
            var line_length = str.length / lines;
            for(var i = 0; i < lines; i++) {
              if(i == lines - 1) {
                subs.push(leftover);
              } else {
                var arr = trim_line(leftover, line_length);
                leftover = arr[1];
                subs.push(arr[0]);
              }
            }
            max_text_width = Math.max.apply(null, subs.map(function(l) { return context.measureText(l).width; }));
          }
          var full_height = lines * (size * 1.3);
          // If we can't fit on enough lines, or the combined
          // lines would be too tall, try a smaller font
          if(max_text_width <= text_width && full_height < text_height) {
            // we have a winner!
            size_ready = true;
          } else {
            size = size - 2;
            context.font = size + 'px Arial';
            max_text_width = context.measureText(str).width;
          }
        }        
        
        var text = document.createElement('text');
        text.classList.add('text');
        text.style.fontSize = size + 'px';
        text.innerText = str;
        elem.appendChild(text);
        if(!page) {
          text.style.marginTop = '50px';
        } else {
          text.innerText = page.text;
          elem.appendChild(text);
          // TODO: algorithm for text size
  
          if(page.image2_url && page.image_url != page.image2_url) {
            var img = document.createElement('img');
            img.classList.add('img_left');
            img.src = page.image_url;
            elem.appendChild(img);
  
            var img = document.createElement('img');
            img.classList.add('img_right');
            img.src = page.image_url;
            elem.appendChild(img);
          } else if(page.image_url) {
            var img = document.createElement('img');
            img.classList.add('img');
            img.src = page.image_url;
            elem.appendChild(img);
          }  
        }
      };
      var elems = [];
      var track = {
        id: 'book-' + book.id,
        type: 'book',
        dom_tag: 'covidspeak-book',
        generate_dom: function(opts) {
          if(opts && opts.mini) {
            var img = new Image();
            img.src = "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d6.svg";
            return img;
          }
          // opts.for_communicator
          var elem = document.createElement('covidspeak-book');

          var div = document.createElement('div');
          div.classList.add('page');
          elem.appendChild(div);

          if(initiator) {
            var button = document.createElement('button');
            button.classList.add('back');
            var img = new Image();
            img.src = "data:image/png;base64,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";
            button.appendChild(img);
            var span = document.createElement('span');
            span.innerText = "Back";
            button.appendChild(span);
            button.addEventListener('click', function(e) {
              book.page = Math.max(book.page - 1, 0);
              elems.forEach(function(elem) {
                render_page(elem, book.page);
              });
              callback();
            })
            elem.appendChild(button);

            var button = document.createElement('button');
            button.classList.add('next');
            img = new Image();
            img.src = "data:image/png;base64,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";
            button.appendChild(img);
            var span = document.createElement('span');
            span.innerText = "Next";
            button.appendChild(span);
            button.addEventListener('click', function(e) {
              book.page = Math.min(book.page + 1, book.pages.length);
              elems.forEach(function(elem) {
                render_page(elem, book.page);
              });
              callback();
            })
            elem.appendChild(button);
          }

          render_page(elem, book.page);
          custom_track.last_processed = {
            type: 'book',
            id: book.id,
            share_id: book.share_id,
            track: track,
            update: function(updated_book) {
              if(book.page != updated_book.page) {
                book.page = updated_book.page;
                elems.forEach(function(elem) {
                  render_page(elem, updated_book.page);
                });
              }
            }
          };
          elems.push(elem);
          return elem;
        }
      };
      if(initiator) {
        track.process = function(state)  {
          // handle stateful updates from others
        };
      }
      return track;
      // TODO: If they tap secondary_preview, then
      // swap the preview with the main view
      // (non-video will need some preview attribute)
    }
  };
})();


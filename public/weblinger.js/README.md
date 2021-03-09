# WebLinger.js
WebLinger.js is a library for supporting alternative
access to web page content. It is a wrapper library for
some very slick and (and large Mb) libraries that can
support head tracking and eye gaze. These sub-libraries
are dynamically loaded to help with startup time.

Camera-based, in-browser head and eye tracking is
process-intensive, so don't expect awesomoe battery
life when using these libraries.

## Documentation
```js
weblinger.start({
  source: 'head', // head, gaze, cursor
  calibration: 'default', // default, callback function
  mode: 'pointer', // pointer, joystick
  cursor: 'red_circle', // red_circle, dot, image_url
  selection_type: 'linger', // linger, expression, [keycodes], none
  selection_action: 'click', // click, callback function
  linger_duration: 1000, // ms
  linger_type: 'auto', // auto, maintain, rest
  target: 'tabbable', // tabbable, [elements], callback function
  target_highlight: 'overlay' // overlay, .css_classs
});
weblinger.stop();
```
### weblinger.start
Starts the tracking system. Note that trackers need access
to the user-facing camera. If you are planning to 
getUserMedia for an alternative camera (especially on 
mobile) you will first need to hard stop weblinger
tracking, otherwise you may have unexpected failures.

*event_callback* - A callback method to provide 
updates on weblinger events. Most of these events can
be intercepted via the DOM if you prefer that approach,
but this data is a little more fine-grained. The first
argument will have a `type`, check out demo.html for
examples of use (including getting the video or canvas
element for rendering in the UI)

*tilt_sensitivity* - Used for head tracking in joystick
mode. 1.0 is default 0.5 is less-sensitive (more movement
required), 2.0 is
extra-sensitive (less movement required)

*option* - does some things

*return value*  - returns a Promise when fully started

### weblinger.stop
Stops the tracking. Note that trackers are typically not 
torn down because of intiailization overhead, and are  
instead paused.

*teardown* - set to true to completely tear down all trackers.
Otherwise it will just pause.

*return value*  - returns a Promise when fully stoppeed/paused

### Gotchas
Trackers leverage getUserMedia to track and analyze the
user-facing camera. If you are planning to call
getUserMedia for a different camera, you will first need
to hard stop weblinger tracking, otherwise you may
have unexpected (and hard to troubleshoot) failures -- 
especially on mobile devices.

## LICENSE

MIT

NOTE: This repo includes sub-libraries with their own 
licenses, so you must decide which you will include. They
are included here for reference purposes and because we had
to make minor tweaks to get them working together,
*but their licensing may mean they are not appropriate for your project*. Use the libraries
at your own risk.

- [JeelizWeboji](https://github.com/jeeliz/jeelizWeboji) has an Apache 2.0 license
- [webgazer.js](https://github.com/brownhci/WebGazer) has a GPLv3 license, but allows LGPLv3 for companies with a valuation < $1M
# Co-VidSpeak
Co-VidSpeak was created from discussions by Bill Binko and
Brian Whitmer. We realized during the Covid-19 pandemic that
people on a breathing tube in the ICU are being physically 
isolated from family, but that a video call wouldn't be enough
to help the communicate.

We have family members and friends
who have been intubated in intensive care situations, and
wanted to make sure anyone in a socially isolated situation
could still have access to and communication with the 
people who were important to them.

## More Details
Co-VidSpeak is an open source communication tool built on 
WebRTC targeted at individuals with complex communication
needs. Imagine if you can't speak (either suddenly or
otherwise), but you still want to be able to connect with
people in your life. If you are in a hospital, care facility, 
or for other reasons can't connect with people who can 
provide you emotional support or therapy, then in theory
you could connect via video chat.

But video chat on its own doesn't support non-verbal 
communication. Co-VidSpeak provides a grid of buttons
wrapped around the video feed to allow people to hit
the buttons themselves, or indicate them using their
eyes so the other party can notice where they are looking
and acknowledge the communication.

There are other features as well, but those are the basics.

## Getting Started

Co-VidSpeak is a Rails backend (mainly for the API) and a
lightweight JavaScript frontend (prolly shoulda started
with a framework, but didn't). We run it in Heroku so I 
assume other container frameworks shouldn't be too bad.

Check out `.env.example` for configuration settings. Also 
keep in mind Redis and Postgres (other other db) are 
required (see `config/database.yml` and `config/cable.yml`)

If you are not using Twilio Video as your delivery system,
ActionCable is required to coordinate room management
between participants.

To get a barebones system running you should be able to do
the following once you have Redis and Postgres (or other db) running
and configured:

```
bundle install
bundle exec rake db:migrate
rails server
```

That should load the app, but you won't be able to start
a shared room until you have a TURN server or Twilio account
set up. You can enter `mirror` as the join code to join
a room with yourself, but that's it.
Below are examples of configurations that should
allow you to start a two-person room:

```
bundle exec rails console
# To make a join code that will use Twilio Video (easiest)
a = Account.new(code: 'my_join_code')
a.settings = {"type"=>"twilio"}
a.save!

# To make a join code that will use Twilio's TURN servers
a = Account.new(code: 'my_join_code')
a.settings = {"source"=>"twilio", "type"=>"webrtc"}
a.save!

# To make a join code that will use a custom TURN server
a = Account.new(code: 'my_join_code')
a.settings = {"address"=>"my.turnserver.org", "verifier"=>"hmac_sha1"}
# If auth is disabled for the TURN server, this can be whatever
a.verifier = "SHARED_SECRET"
a.save!
```

Once you have an account created you should be able to enter
the join code you specified and start a new room. Keep in mind
if web sockets are not enabled on your server then you won't
be able to join a room with another person because negotiation
will fail.

### Scaling

Co-VidSpeak should work with multiple hosting servers. As long
as all servers can connect to the same Redis cluster and
Postgres database, the data should stay synced. Database
load should be minimal, though Redis is used both for 
basic key-value storage (lightweight) and 

## Contributions
Look in `app/assets/javascripts` for the js files. Keep
in mind all js files are loaded for every page. CSS is
in `app/assets/stylesheets`. HTML files are in
`app/views/index` and `app/views/layouts`. Backend code
should be straightforward if you know Rails. Projects
listed below if you feel like taking one on. Please let me
know if you do so we don't reproduce work. Chat/Q&A available
via Slack join link at https://www.openaac.org .

## HIPAA

As long as the application and its hosting services, etc. 
request no user information and store no user information 
(other than transiently) including IP address and URL-based 
identifiers, photos, etc.
then (in theory) it can leverage the 
<b>conduit exception rule</b>, and 
does not need to enter into a Business Asssociate 
Agreement with the health provider.

https://www.hipaajournal.com/hipaa-conduit-exception-rule/

## TODO
(Contributions welcome!)
- Backend specs
- Frontend specs
- Track down issue with Twilio TURN server sessions not loading if parter waits more than 10 minutes to join
- Throttling (rack-attack?)
- Optional speech output (maybe just from the communicator?)
- Turn off video rendering on page blur (Google Meet des this, saves battery?)
- Way to send invite links before starting a room (while still enforcing usage limits)
- Page to list suggested alternative layout sets
- Support for Multiple visitors
- Options for longer highlight, auditory cues, etc.
- Support cursor hover for eye-gaze-enabled computers
- Consider https://webgazer.cs.brown.edu/

## License

MIT
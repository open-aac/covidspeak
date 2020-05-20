require 'twilio-ruby'

class Api::RoomsController < ApplicationController
  def update
    # 1. error if the room record isn't present
    #    (it should have been created by user reg)
    # 2. push out the room expiration in redis
    # 3. mark the room as activated
    # 4. user_id will either be the communicator's id
    #    or the visitor's randomly-generated id
    # 5. mark the user_id as allowed to enter the room
    # 6. when the user joins the room cable/channel,
    #    verify them and then broadcast to everyone
    #    else in the room that someone new arrived
    # 7. send the room joining credentials/settings

    # Required for any Twilio Access Token
    
    identity = params['user_id']
    # Trim identity to exclude verifier, since id get published with room
    trimmed_identity = identity.split(/:/)[0, 2].join(':')
    room = Room.find_by(code: params['id'])
    if !room
      return api_error(400, {error: "invalid room id, #{params['room_id']}"})
    end
    room_id = room.code
    # TODO: ensure user matches room id
    room_key = "VidChatFor-#{room_id}"
    access = nil

    if room.type == 'twilio'
      account_sid = ENV['TWILIO_ACCOUNT_ID']
      api_key = ENV['TWILIO_KEY']
      api_secret = ENV['TWILIO_SECRET']

      # Manually create the room on the backend
      @client = Twilio::REST::Client.new(api_key, api_secret)
      twilio_room = @client.video.rooms(room_key).fetch rescue nil
      # Only allow creating the room if it's the correct user
      if !twilio_room
        account = room.account
        if !Account.valid_user_id?(identity)
          return api_error(400, {error: "invalid user id, #{identity}"})
        else
          ref_room = account.generate_room(identity)
          if room != ref_room
            return api_error(400, {error: "wrong user id for room"})
          elsif ref_room && ref_room.throttled?
            return api_error(400, {error: "no room slots available", throttled: ref_room.throttled?})
          end
        end
      end

      # Generate the room if not already there
      twilio_room ||= @client.video.rooms.create(
                              enable_turn: true,
                              type: 'peer-to-peer',
                              unique_name: room_key
      )

      # Create an Access Token
      token = Twilio::JWT::AccessToken.new(account_sid, api_key, api_secret, [], identity: trimmed_identity);
    
      # Create Video grant for our token
      grant = Twilio::JWT::AccessToken::VideoGrant.new
      grant.room = room_key
      token.add_grant(grant)
      access = {token: token.to_jwt}
    elsif room.type == 'webrtc'
      account = room.account
      return api_error(400, {error: 'no account for this room'}) unless account
      if account.settings['source'] == 'twilio'
        account_sid = ENV['TWILIO_ACCOUNT_ID']
        api_token = ENV['TWILIO_TOKEN']
  
        # Manually create the room on the backend
        @client = Twilio::REST::Client.new(account_sid, api_token)
        token = @client.tokens.create
        access = {
          "ice_servers": token.ice_servers,
          "password": token.password,
          "ttl": token.ttl,
          "username": token.username
        }
      elsif account.settings['address']
        timed_trimmed_identity = "#{48.hours.from_now.to_i}:#{trimmed_identity}"
        cred = timed_trimmed_identity
        if account.settings['verifier'] == 'custom_md5'
          cred = Digest::MD5.hexdigest("signed#{trimmed_identity}verifier")
        elsif account.settings['verifier'] == 'hmac_sha1'
          cred = account.verifier(timed_trimmed_identity)
        end
        port = account.settings['port'] || 3478
        servers = [
          {
            url: "stun:#{account.settings['address']}:#{port}?transport=udp",
            urls: "stun:#{account.settings['address']}:#{port}?transport=udp",
            username: timed_trimmed_identity,
            credential: cred
          }
        ]
        if account.settings['udp'] != false
          servers << {
            url: "turn:#{account.settings['address']}:#{port}?transport=udp",
            urls: "turn:#{account.settings['address']}:#{port}?transport=udp",
            username: timed_trimmed_identity,
            credential: cred
          }
        end
        if account.settings['tcp'] != false
          servers << {
            url: "turn:#{account.settings['address']}:#{port}?transport=tcp",
            urls: "turn:#{account.settings['address']}:#{port}?transport=tcp",
            username: timed_trimmed_identity,
            credential: cred
          }
          servers << {
            url: "turn:#{account.settings['address']}:443?transport=tcp",
            urls: "turn:#{account.settings['address']}:443?transport=tcp",
            username: timed_trimmed_identity,
            credential: cred
          }
        end
        access = {
          "username": trimmed_identity,
          "ice_servers": servers,
          "ttl": 86400
        }
      end
    else
      return api_error(400, {error: "unrecognized room type, #{room.type}"})
    end
    # TODO: send video quality setting, so we can request
    # lower-res video for the visitor vs. the communicator
    room.allow_user(trimmed_identity)

    # Optional JavaScript URL to embed on room load
    js_url = (room.account && room.account.settings['js_url']) || nil

    # Generate the token
    render :json => {:room => {id: room_id, key: room_key, type: room.type, high_res: false, js: js_url}, user_id: trimmed_identity, access: access}
  end

  def keepalive
    room = Room.find_by(code: params[:room_id])
    if room && room.user_allowed?(params[:user_id])
      if params['empty']
        room.closed
      else
        room.in_use
      end
      render json: {updated: true}
    else
      api_error(400, {error: "room or user not found"})
    end
  end
end

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
    # TODO: rooms should become un-joinable after 12 hours
    room_id = room.code
    room_key = room.room_key
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
    if room && room.user_allowed?(params[:user_id]) && !room.concluded?
      if params['empty']
        room.closed
      else
        params['ip'] = request.remote_ip
        room.in_use(params[:user_id], params)
      end
      render json: {updated: true}
    else
      api_error(400, {error: "room or user not found"})
    end
  end

  def user_coming
    room = Room.find_by(code: params['room_id'])
    if room && room.room_key && !room.concluded?
      room.partner_joined(params['status'] != 'connecting')
      params['ip'] = request.remote_ip
      room.user_accessed(params['pending_id'], params) if params['pending_id']
      RoomChannel.broadcast(room.room_key, {
        type: 'user_coming',
        status: params['status'].to_s
      })
    end
    render json: {ok: true}
  end

  def list_schedule
    account = Account.find_by_schedule_id(params['account_id'])
    if !account
      return api_error(400, {error: 'invalid schedule_id'})
    end
    @recent_rooms = account.rooms.where(['created_at > ?', 2.days.ago])
    @pending_rooms = account.pending_rooms.where(activated: false).select{|r| r.settings['start_at'] && r.settings['start_at'] > 6.hours.ago.iso8601}
    list = @pending_rooms + @recent_rooms
    render json: {rooms: list.map{|r| room_json(r) }.sort_by{|r| r[:started_at] || r[:start_at]} }
  end

  def schedule
    account = Account.find_by_schedule_id(params['account_id'])
    PendingRoom.flush_rooms
    if !account
      return api_error(400, {error: 'invalid schedule_id'})
    end
    pending_room = PendingRoom.generate(account, params)
    render json: {room: room_json(pending_room)}
  end

  def activate
    pending_room = PendingRoom.find_by(code: params['room_id'])
    return api_error(400, {error: 'room not found'}) unless pending_room
    if pending_room.activated
      render json: {user: {id: pending_room.settings['identity'], room_id: pending_room.settings['room_code']}}
      return
    end
    res = pending_room.activate
    room = res[:room]
    return api_error(400, {error: "no room generated"}) unless room
    return api_error(400, {error: "no room slots available", throttled: room.throttled?}) if room.throttled?

    render :json => {:user => {id: res[:identity], room_id: room.code}}
  end

  def status
    if params['room_id'].match(/^p/)
      pending_room = PendingRoom.find_by_attendee_code(params['room_id'])
      return api_error(400, {error: "no room found"}) unless pending_room
      if !pending_room.settings['room_id']
        if !pending_room.settings['partner_checked']
          pending_room.settings['partner_checked'] = true
          pending_room.save
        end
        render json: room_json(pending_room, true)
        return
      end
      @limit_content = true
      room = Room.find_by(id: pending_room.settings['room_id'])
    else
      room = Room.find_by_code(params['room_id'])
    end
    return api_error(400, {error: "no room found"}) unless room
    render json: room_json(room, !!@limit_content)
  end

  def unschedule
    account = Account.find_by_schedule_id(params['account_id'])
    if !account
      return api_error(400, {error: 'invalid schedule_id'})
    end
    pending_room = account.pending_rooms.find_by(code: params['code'])
    return api_error(400, {error: 'room not found'}) unless pending_room
    pending_room.destroy
    render json: {room: room_json(pending_room)}
  end

  def room_json(room, simple=false)
    if room.is_a?(PendingRoom)
      res = {
        pending: true,
        start_at: room.settings['start_at'],
        joinable: true,
        code: room.attendee_code
      }
      if !simple
        res = res.merge({
          as_communicator: room.settings['as_communicator'],
          name: room.settings['name'],
          code: room.code
        })
      end
      res
    elsif room.is_a?(Room)
      res = {
        joinable: !room.settings['started_at'] || room.settings['started_at'] > 12.hours.ago.to_i,
        code: room.code,
        started_at: (room.settings['started_at'] ? Time.at(room.settings['started_at']) : room.created_at).utc.iso8601,
        ended_at: room.settings['ended_at'] && Time.at(room.settings['ended_at']).utc.iso8601  
      }
      if !simple
        res = res.merge({
          name: room.settings['name'] || "Unscheduled Room",
          partner_status: room.settings['partner_status'],
          total_users: (room.settings['active_user_ids'] || []).uniq.length,
          duration: room.duration || 0,  
        })
      end
      res
    else
      {}
    end
  end
end

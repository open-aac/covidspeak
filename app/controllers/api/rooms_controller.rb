require 'twilio-ruby'

class Api::RoomsController < ApplicationController
  def update
    return api_error(400, {error: "unrecognized type: #{params['type']}"}) unless params['type'] == 'twilio'
    # Required for any Twilio Access Token
    account_sid = ENV['TWILIO_ACCOUNT_ID']
    api_key = ENV['TWILIO_KEY']
    api_secret = ENV['TWILIO_SECRET']
    
    identity = params['user_id']
    room_id = params['id']
    if !Account.valid_room_id?(room_id)
      return api_error(400, {error: "invalid room id, #{room_id}"})
    end
    # TODO: ensure user matches room id
    room_key = "CoVidChatFor#{room_id}"
    
    # Manually create the room on the backend
    @client = Twilio::REST::Client.new(api_key, api_secret)
    room = @client.video.rooms(room_key).fetch rescue nil
    # Only allow creating the room if it's the correct user
    if !room
      if !Account.valid_user_id?(identity)
        return api_error(400, {error: "invalid user id, #{identity}"})
      elsif room_id != Account.generate_room(identity)
        return api_error(400, {error: "wrong user id for room"})
      end
    end

    # Trim identity to exclude verifier, since id get published with room
    identity = identity.split(/:/)[0, 2].join(':')
    # Generate the room if not already there
    room ||= @client.video.rooms.create(
                             enable_turn: true,
                             type: 'peer-to-peer',
                             unique_name: room_key
    )

    # Create an Access Token
    token = Twilio::JWT::AccessToken.new(account_sid, api_key, api_secret, [], identity: identity);
    
    # Create Video grant for our token
    grant = Twilio::JWT::AccessToken::VideoGrant.new
    grant.room = room_key
    token.add_grant(grant)
    
    # Generate the token
    render :json => {:room => {id: room_id, key: room_key}, user_id: identity, access_token: token.to_jwt}
  end
end

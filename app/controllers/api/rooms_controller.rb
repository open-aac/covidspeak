require 'twilio-ruby'

class Api::RoomsController < ApplicationController
  def update
    # Required for any Twilio Access Token
    account_sid = ENV['TWILIO_ACCOUNT_ID']
    api_key = ENV['TWILIO_KEY']
    api_secret = ENV['TWILIO_SECRET']
    
    identity = params['user_id']
    room_id = params['id']
    
    # Create an Access Token
    token = Twilio::JWT::AccessToken.new(account_sid, api_key, api_secret, [], identity: identity);
    room_key = "RoomFor#{room_id}"
    
    # Create Video grant for our token
    grant = Twilio::JWT::AccessToken::VideoGrant.new
    grant.room = room_key
    token.add_grant(grant)
    
    # Generate the token
    render :json => {:room => {id: room_id, key: room_key}, user_id: identity, access_token: token.to_jwt}
  end
end

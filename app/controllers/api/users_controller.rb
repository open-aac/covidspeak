require 'twilio-ruby'

class Api::UsersController < ApplicationController
  def create
    # Required for any Twilio Access Token
    account_sid = ENV['TWILIO_ACCOUNT_ID']
    api_key = ENV['TWILIO_KEY']
    api_secret = ENV['TWILIO_SECRET']
    
    identity = params['user_id']
    
    # Create an Access Token
    token = Twilio::JWT::AccessToken.new(account_sid, api_key, api_secret, [], identity: identity);
    
    # Create Video grant for our token
    grant = Twilio::JWT::AccessToken::VideoGrant.new
    grant.room = "RoomFor#{identity}"
    token.add_grant(grant)
    
    # Generate the token
    render :json => {:user => {id: identity}, access_token: token.to_jwt}
  end
end

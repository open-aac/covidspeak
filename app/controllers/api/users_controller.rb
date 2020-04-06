require 'twilio-ruby'

class Api::UsersController < ApplicationController
  def create
    # Required for any Twilio Access Token
    return api_error(400, {error: "unrecognized type: #{params['type']}"}) unless params['type'] == 'twilio'
    
    identity = nil
    if params['user_id']
      identity = params['user_id']
    elsif params['join_code']
      if Account.valid_code?(params['join_code'])
        identity = Account.generate_user
      end
    end
    identity = nil unless Account.valid_user_id?(identity)
    return api_error(400, {error: "no user generated"}) unless identity
    room_id = Account.generate_room(identity)
    
    # Generate the token
    render :json => {:user => {id: identity, room_id: room_id}}
  end
end

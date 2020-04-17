require 'twilio-ruby'

class Api::UsersController < ApplicationController
  def create
    identity = nil
    if params['user_id'] && params['room_id']
      identity = params['user_id']
    elsif params['join_code']
      account = Account.find_by(code: params['join_code'])
      if account
        identity = Account.generate_user
      end
    end
    identity = nil unless Account.valid_user_id?(identity)
    return api_error(400, {error: "no user generated"}) unless identity
    room = Room.find_by(code: params['room_id'])
    room ||= account.generate_room(identity) if params['join_code']
    raise api_error(400, {error: "no room generated"}) unless room
    
    # Generate the token
    render :json => {:user => {id: identity, room_id: room.code}}
  end
end

require 'twilio-ruby'

class Api::UsersController < ApplicationController
  def create
    identity = nil
    root_user = false
    if params['user_id'] && params['room_id']
      identity = params['user_id']
    elsif params['join_code']
      root_user = true
      # TODO: throttle
      account = Account.find_by_code(params['join_code'])
      if account
        identity = Account.generate_user
      end
    end
    identity = nil unless identity && Account.valid_user_id?(identity)
    return api_error(400, {error: "no user generated"}) unless identity
    room = Room.find_by(code: params['room_id'])
    room ||= account.generate_room(identity) if params['join_code']
    return api_error(400, {error: "no room generated"}) unless room
    return api_error(400, {error: "no room slots available", throttled: room.throttled?}) if room.throttled?
    trimmed_identity = identity.split(/:/)[0, 2].join(':')
    params['ip'] = request.remote_ip
    room.user_accessed(trimmed_identity, params)
    room.save!
    if account
      account.settings['last_room_at'] = Time.now.to_i
      account.settings['recent_rooms'] = Room.where(account_id: account.id).where(['created_at > ?', 2.weeks.ago]).map{|r| (r.duration || 0) > 3 }.count
      account.save
    end
    
    # Generate the token
    render :json => {:user => {id: identity, room_id: room.code}}
  end

  def bundle
    bundle = Bundle.generate(params)
    render json: {bundle: {id: bundle.code}}
  end
end

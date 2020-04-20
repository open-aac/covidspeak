class RoomChannel < ApplicationCable::Channel  
  def subscribed
    @room_id = params[:room_id]
    room = Room.find_by(code: params[:room_id])
    return reject unless room && params[:user_id] && room.user_allowed?(params[:user_id])
    stream_from RoomChannel.room_key(params[:room_id])
    ids = RedisAccess.default.lrange("users_for_#{@room_id}", 0, -1).map{|id| {id: id} }
    if(!ids.detect{|u| u[:id] == params[:user_id] })
      RedisAccess.default.rpush("users_for_#{@room_id}", params[:user_id])
    end
    RedisAccess.default.expire("users_for_#{@room_id}", 24.hours.to_i)
    self.broadcast_users
  end

  def unsubscribed
    # TODO: make sure to unsubscribe, then disconnect,
    # when a user intentionally leaves a room. It won't
    # always happen that way, but it will make things cleaner
  end

  def receive(data)
    if data['type'] == 'candidate'
      # re-broadcast
      RoomChannel.broadcast(@room_id, data)
    elsif data['type'] == 'offer'
      # re-broadcast
      RoomChannel.broadcast(@room_id, data)
    elsif data['type'] == 'answer'
      # re-broadcast
      RoomChannel.broadcast(@room_id, data)
    elsif data['type'] == 'users'
      self.broadcast_users
    else
      RoomChannel.broadcast(@room_id, data)
      # not recognized
    end
  end

  def broadcast_users
    list = RedisAccess.default.lrange("users_for_#{@room_id}", 0, -1).map{|id| {id: id} }
    RoomChannel.broadcast(@room_id, {
      type: 'users',
      list: list
    })
  end

  def self.room_key(room_id)
    "room-#{room_id}"
  end

  def self.broadcast(room_id, message)
    ActionCable.server.broadcast(RoomChannel.room_key(room_id), message)
  end
end  
class Room < ApplicationRecord
  include SecureSerialize
  secure_serialize :settings

  belongs_to :account
  before_save :generate_defaults

  def generate_defaults
    self.settings ||= {}
    self.settings['name'] ||= "Unscheduled Room"
    if self.settings['ended_at'] && self.settings['started_at']
      # Remember: duration is in seconds
      self.duration = self.settings['ended_at'] - self.settings['started_at'] - (self.settings['gaps'] || []).map{|g| g['duration'] || 0}.sum
    end
    true
  end
  
  def account
    res = Account.find_by(id: self.account_id)
    if self.settings['account_sub_id']
      res.instance_variable_set('@sub_id', self.settings['account_sub_id'])
    end
    res
  end

  def concluded?
    ((self.settings || {})['ended_at'] || Time.now.to_i) < 24.hours.ago.to_i
  end

  def room_key
    "VidChatFor-#{self.code}"
  end

  def type
    self.account.backend_type
  end

  def self.find_by_code(code)
    code = code.sub(/^VidChatFor-/, '')
    find_by(code: code)
  end

  def short_room?
    # Short rooms are for demo purposes, and are just long
    # enough to kick the tires, but not long enough to 
    # have a real call
    !!self.settings['short_room']
  end

  def background_room?
    # Background rooms are for situations where partners
    # come and go, but the communicator stays in the empty
    # room between visits
    !!self.settings['background_room']
  end

  def joinable?
    return false if self.concluded?
    return true if !self.settings['started_at']
    return true if self.background_room?
    return self.settings['started_at'] > 12.hours.ago.to_i
  end

  def send_invite(target, host)
    type = nil
    type = :email if target.to_s.match(/@/)
    type = :sms if target.to_s.strip.match(/\+?[\d-]+/)
    return false if (self.settings['remote_invites'] || 0) > 10 && !self.background_room?
    url = "#{host}/rooms/#{self.code}/join"
    send = false;
    if type == :email
      RoomMailer.deliver_message('room_invite', target, url)
      sent = true
    elsif type == :sms
      Pusher.sms(target, "Room Invite - #{url}")
      sent = true
    end
    if sent
      self.settings['remote_invites'] = (self.settings['remote_invites'] || 0) + 1
      self.save
    end
    return sent
  end

  def time_left
    if !self.settings['started_at']
      self.settings['started_at'] ||= Time.now.to_i
      self.save
    end
    time_cutoff = 6.hours.to_i
    time_cutoff = 3.minutes.to_i if self.short_room?
    time_cutoff = 72.hours.to_i if self.background_room?
    time_cutoff - (self.duration || 0)
  end

  def expired?
    res = self.time_left < 0
    RedisAccess.default.setex("room_expired/#{self.code}", 6.hours.to_i, 'true')
    res
  end

  def throttled?
    !!@throttled
  end

  def self.throttle_response(throttle)
    res = Room.new
    res.instance_variable_set('@throttled', throttle)
    res
  end

  def allow_user(user_id)
    self.settings ||= {}
    self.settings['allowed_user_ids'] ||= []
    self.settings['allowed_user_ids'] << user_id
    self.settings['allowed_user_ids'].uniq!
    self.save!
  end

  def user_allowed?(user_id)
    ((self.settings || {})['allowed_user_ids'] || []).include?(user_id)
  end

  def closed
    self.settings ||= {}
    now = Time.now.to_i
    self.settings['started_at'] ||= now
    self.settings['ended_at'] = [self.settings['ended_at'], now].compact.min
    self.settings.delete('buffered_ended_at')
    self.save
  end

  def partner_joined(status)
    self.settings ||= {}
    # in_use calls (keepalive) will set status to connected,
    # so if a partner joins but never reaches connected, we
    # should mark how close they got
    if self.settings['partner_status'] != 'connected'
      # connecting - partner joined room, started connecting
      # invite_modal - initiator sent an invite
      # training - taking the training
      # ready_to_enter - partner needs to joion room
      self.settings['partner_status'] = status || 'attempted'
    end
    self.save
  end

  def user_accessed(user_id, opts)
    self.settings ||= {}
    self.settings['room_nonce'] ||= GoSecure.nonce('user_id_hash_nonce')
    user_id_hash = GoSecure.sha512(user_id.to_s, "user_id_hash_#{self.settings['room_nonce']}")[0, 5]
    self.settings['active_user_ids'] ||= []
    self.settings['active_user_ids'] << user_id_hash
    self.settings['active_user_ids'].uniq!
    self.settings['user_configs'] ||= {}
    if opts && opts['pending_id'] && user_id
      # when the partner joins, they will send both pending_id
      # and user_id, so we can remove the pending config
      pending_id_hash = GoSecure.sha512(user_id.to_s, "user_id_hash_#{self.settings['room_nonce']}")[0, 5]
      self.settings['user_configs'].delete(pending_id_hash)
    end
    if opts && opts['system'] && opts['browser']
      self.settings['user_configs'][user_id_hash] ||= {}
      self.settings['user_configs'][user_id_hash]['system'] ||= opts['system']
      self.settings['user_configs'][user_id_hash]['browser'] ||= opts['browser']
      self.settings['user_configs'][user_id_hash]['mobile'] ||= (opts['mobile'] && opts['mobile'] != 'false' && opts['mobile'] != '')
      self.settings['user_configs'][user_id_hash]['reactions'] = opts['reactions'].to_i
      self.settings['user_configs'][user_id_hash]['buttons'] = opts['buttons'].to_i
      self.settings['user_configs'][user_id_hash]['minutes_heard'] = opts['minutes_heard'].to_i
      self.settings['user_configs'][user_id_hash]['timestamp'] ||= Time.now.to_i
      if opts['ip']
        hashed_addr = Room.masked_ip(opts['ip'], self.settings['room_nonce']) rescue nil
        self.settings['user_configs'][user_id_hash]['ip_hash'] ||= hashed_addr if hashed_addr
      elsif opts['hashed_ip']
        self.settings['user_configs'][user_id_hash]['ip_hash'] ||= opts['hashed_ip']
      end
    end
  end

  def self.masked_ip(ip, nonce)
    begin
      addr = IPAddr.new(ip)
      hashed_addr = GoSecure.sha512(addr.mask(16).to_s, "partial_ip_#{nonce}")[0, 5]
      return hashed_addr
    rescue => e
      return nil
    end
end

  def in_use(user_id, opts={})
    self.settings ||= {}
    now = Time.now.to_i
    if self.settings['ended_at'] && self.settings['ended_at'] < now - (5 * 60)
      # if more than 5 minutes of inactivity, note the gap in timing
      self.settings['gaps'] ||= []
      self.settings['gaps'] << {
        'from' => self.settings['ended_at'],
        'to' => now - 30,
        'duration' => (now - self.settings['ended_at'])
      }
    end
    self.user_accessed(user_id, opts)
    self.settings['partner_status'] = 'connected'
    self.settings['started_at'] ||= now
    self.settings['ended_at'] = now
    self.settings['buffered_ended_at'] = now + 5.minutes.to_i
    res = self.save
    if self.account
      self.account.track_usage(self)
    end
    res
  end
end

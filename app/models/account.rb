require 'go_secure'

class Account < ApplicationRecord
  has_many :rooms
  has_many :pending_rooms
  
  include SecureSerialize
  secure_serialize :settings
  before_save :generate_defaults

  def generate_defaults
    self.settings ||= {}
    self.settings['nonce'] ||= GoSecure.nonce('account_verifier')
    self.archived = !!(self.settings['last_room_at'] && self.settings['last_room_at'] < 6.months.ago.to_i)
    self.email_hash = Account.generate_email_hash(self.settings['contact_email']) if !self.settings['contact_email'].blank?
    true
  end

  def update_stats
    self.generate_defaults
    last_room = Room.where(account_id: self.id).order('created_at').last
    if last_room
      self.settings['last_room_at'] = last_room.created_at.to_i
      self.settings['recent_rooms'] = Room.where(account_id: self.id).where(['created_at > ?', 2.weeks.ago]).map{|r| (r.duration || 0) > 3 }.length
      self.save
    end
  end

  def self.generate_email_hash(email)
    GoSecure.sha512(email.to_s.strip.downcase, 'email_hash_code')
  end
  
  def self.free_duration
    return 30 # 30 minutes free every month
  end

  def self.ignore_duration
    return 3 # super-short meetings don't count
  end

  def track_usage(force)
    month_start = Date.today.beginning_of_month
    if !force
      recent_rooms = Room.where(account_id: self.id).where(['created_at > ?', 45.days.ago])
      current_month_rooms = rooms.select{|r| r.duration && r.duration > self.ignore_duration && r.settings['started_at'] && r.settings['started_at'] > month_start.to_i }
      tally_duration = current_month_rooms.map{|r| r.duration }.sum
      force = true if tally_duration > Account.free_duration
    end
    if force && self.paid_account?
      if self.settings['subscription'] && self.settings['subscription_id']
        account_rooms = self.settings['max_concurrent_rooms'] || 1
        Purchasing.update_meter(account, {quantity: account_rooms}
      end
    end
  end

  def admin_code(ts=nil)
    if !self.settings['nonce']
      self.generate_defaults
      self.save!
    end
    parts = [self.id.to_s, ts || Time.now.to_i.to_s]
    parts << GoSecure.sha512(parts.to_json, "admin_code_#{self.settings['nonce']}")
    parts.join('_')
  end

  def self.find_by_admin_code(aid)
    id, ts, verifier = (aid || '').split(/_/)
    return nil unless id && ts && verifier
    return nil if ts.to_i < 12.hours.ago.to_i
    account = Account.find_by(id: id)
    return nil unless account && aid == account.schedule_id(ts)
    return account
  end

  def schedule_id(ts=nil)
    if !self.settings['nonce']
      self.generate_defaults
      self.save!
    end
    parts = [self.id.to_s, ts || Time.now.to_i.to_s]
    parts << GoSecure.sha512(parts.to_json, "schedule_id_#{self.settings['nonce']}")
    parts.join('_')
  end

  def self.find_by_schedule_id(aid)
    id, ts, verifier = (aid || '').split(/_/)
    return nil unless id && ts && verifier
    return nil if ts.to_i < 12.hours.ago.to_i
    account = Account.find_by(id: id)
    return nil unless account && aid == account.schedule_id(ts)
    return account
  end

  def self.find_by_code(code)
    code, tmp_verifier = code.split(/\./, 2)
    account = Account.find_by(code: code)
    if account && tmp_verifier
      account.clean_old_codes
      if account.settings['codes'][tmp_verifier]
        account.instance_variable_set('@sub_id', tmp_verifier)
        return account
      else
        return nil
      end
    else
      account
    end
  end

  def clean_old_codes
    self.settings ||= {}
    self.settings['codes'] ||= {}
    changed = false
    self.settings['codes'].each do |code, ts|
      next if ts == 'permanent'
      if ts < Time.now.to_i
        changed = true
        self.settings['codes'].delete(code)
      end
    end
    self.save if changed
  end

  def generate_sub_id!(code=nil)
    raise "account not configured for sub-codes" unless self.settings && self.settings['sub_codes']
    self.clean_old_codes
    attempts = 0
    setting = 'permanent'
    while attempts < 10 && (!code || self.settings['codes'][code])
      code = GoSecure.nonce('temporary_account_code')[0, 6].gsub(/0/, 'j').gsub(/1/, 'h')
      setting = 2.weeks.from_now.to_i
    end
    self.settings['codes'][code] = setting
    self.save!

    "#{self.code}.#{code}"
  end

  def copy_server_from(code)
    account = Account.find_by_code(code)
    account.copy_server_to(self)
  end

  def copy_server_to(account)
    ['type', 'source', 'address', 'verifier', 'salt', 'shared_secret', 'port', 'udp', 'tcp'].each do |key|
      account.settings[key] = self.settings[key] if self.settings[key] != nil
    end
    account.save
  end

  def backend_type
    self.settings ||= {}
    if self.settings['type'] == 'twilio'
      'twilio'
    else
      'webrtc'
    end
  end

  def self.generate_user(timestamp=nil, nonce=nil)
    timestamp = nil if timestamp && timestamp.to_s.length < 10
    nonce = nil if nonce && nonce.length < 20
    timestamp ||= Time.now.to_i
    nonce ||= GoSecure.nonce('user confirmation nonce')
    parts = "#{nonce}:#{timestamp.to_s}"
    parts = parts + ":" + GoSecure.sha512(parts, 'user confirmation verification')[0, 50]
    parts
  end

  def self.valid_user_id?(user_id)
    nonce, ts_string, verifier = user_id.split(/:/)
    ts = ts_string.to_i
    return ts > 48.hours.ago.to_i && user_id == generate_user(ts, nonce)
  end

  def generate_room(user_id_or_hash)
    str = user_id_or_hash
    if !user_id_or_hash.match(/^r/)
      str = "r" + GoSecure.sha512(user_id_or_hash, 'room_id for user')[0, 40]
    end
    str = str + ":" + GoSecure.sha512(str, 'room_id confirmation')[0, 40]
    room = Room.find_or_initialize_by(code: str, account_id: self.id)
    room.settings ||= {}
    max_live_rooms = self.settings['max_concurrent_rooms']
    max_daily_rooms = self.settings['max_daily_rooms']
    max_monthly_rooms = self.settings['max_monthly_rooms']
    max_live_subrooms = nil
    max_daily_subrooms = nil
    max_monthly_subrooms = nil
    if @sub_id
      max_live_subrooms = self.settings['max_concurrent_rooms_per_user'] || 1
      max_daily_subrooms = self.settings['max_daily_rooms_per_user']
      max_monthly_subrooms = self.settings['max_monthly_rooms_per_user']
      room.settings['account_sub_id'] = @sub_id 
    end
    if self.settings['ignore_limits_until'] && self.settings['ignore_limits_until'] > Time.now.to_i
      max_daily_rooms = nil
      max_monthly_rooms = nil
      max_daily_subrooms = nil
      max_monthly_subrooms = nil
    end
    # TODO: Right now if you start a bunch of rooms without
    # the partner joining then it won't throttle based on
    # live rooms. Maybe this is ok.
    if !room.id && (max_live_rooms || max_daily_rooms || self.paid_account?)
      if !self.can_start_room?
        return Room.throttle_response('not_active')
      end
      # Only run these checks when creating the room,
      # not when validating room code
      live_rooms = 0
      live_subrooms = 0
      daily_rooms = 0
      daily_subrooms = 0
      monthly_rooms = 0
      monthly_subrooms = 0
      cutoff = (max_monthly_rooms != nil) ? Time.now.beginning_of_month : 24.hours.ago
      recent_rooms = Room.where(account_id: self.id).where(['updated_at > ?', 24.hours.ago]).each do |room|
        # next if @sub_id && room.settings['account_sub_id'] != @sub_id
        
        ended_at = room.settings['buffered_ended_at'] || room.settings['ended_at']
        monthly_rooms += 1
        monthly_subrooms +=1 if @sub_id && room.settings['account_sub_id'] == @sub_id
        if ended_at && ended_at > 12.hours.ago.to_i && room.duration && room.duration > Account.ignore_duration
          daily_rooms += 1
          daily_subrooms +=1 if @sub_id && room.settings['account_sub_id'] == @sub_id
        end
        if ended_at && ended_at > 1.minutes.ago.to_i
          live_rooms += 1
          live_subrooms +=1 if @sub_id && room.settings['account_sub_id'] == @sub_id
        end
      end
      # TODO: note the throttles somewhere so we can review
      # them and make sure there aren't issues, or at least
      # let them know they're happening (highlight in UI list)
      if max_live_rooms && live_rooms >= max_live_rooms
        return Room.throttle_response('too_many_live')
      elsif max_live_subrooms && live_subrooms >= max_live_subrooms
        return Room.throttle_response('too_many_live')
      elsif max_daily_rooms && daily_rooms >= max_daily_rooms
        return Room.throttle_response('too_many_daily')
      elsif max_daily_subrooms && daily_subrooms >= max_daily_subrooms
        return Room.throttle_response('too_many_daily')
      elsif max_monthly_rooms && monthly_rooms >= max_monthly_rooms
        return Room.throttle_response('too_many_monthly')
      elsif max_monthly_subrooms && monthly_subrooms >= max_monthly_subrooms
        return Room.throttle_response('too_many_monthly')
      end
    end
    room
  end
  # for 1Mbps = .45 GB per hour one-way
  # Twilio TURN == $0.40/GB ~= $0.36/hr
  # Twilio Video == $.0015/user/min ~= $0.18/hr
  # Purchase N concurrent rooms at $X/concurrent/month
  # ??Free tier w/ no room limit for Y days, then Z rooms/month

  def self.valid_room_id?(room_id)
    hash, verifier = room_id.split(/:/)
    return room_id == generate_room(hash)
  end

  def id_verifier(identity)
    self.settings ||= {}
    salt = self.settings['salt']
    secret = self.settings['shared_secret']
    return nil unless salt && secret && identity
    secret = GoSecure.decrypt(secret, salt, 'account_hmac_sha1_verifier')
    hmac = OpenSSL::HMAC.digest('sha1', secret, identity)
    Base64.encode64(hmac).strip
  end

  def id_verifier=(str)
    secret, salt = GoSecure.encrypt(str, 'account_hmac_sha1_verifier')
    self.settings['salt'] = salt
    self.settings['shared_secret'] = secret
  end

  def self.access_code(id)
    "#{id}::#{GoSecure.sha512(id.to_s, "admin_access_code_#{ENV['ADMIN_KEY'] || 'admin_nonce'}")[0, 30]}"
  end

  def self.access_token(code)
    id, ver = code.split(/::/, 2)
    if code == access_code(id)
      nonce = GoSecure.nonce('expiring_access_code')[0, 20]
      exp = 72.hours.from_now.to_i.to_s
      verifier = GoSecure.sha512("#{nonce}::#{exp}", "admin_access_token_#{ENV['ADMIN_KEY'] || 'admin_key'}")
      "#{id}::#{nonce}::#{exp}::#{verifier}"
    else
      nil
    end
  end

  def self.valid_access_token?(token)
    return false unless token
    id, nonce, exp, verifier = token.split(/::/, 4)
    ts = exp.to_i
    check = GoSecure.sha512("#{nonce}::#{exp}", "admin_access_token_#{ENV['ADMIN_KEY'] || 'admin_key'}")
    ts > Time.now.to_i && verifier == check
  end

  def self.hex_shortened(hex)
    Base64.urlsafe_encode64([hex].pack("H*"))
  end

  def log_subscription_event
  end

  def paid_account?
    !self.settings['free_account']
  end

  def can_start_room?
    !!(!self.paid_account? || self.settings['subscription_id'])
  end

  def self.confirm_subscription(opts)
    return false unless self.paid_account?
    if opts[:state] == 'active'
      self.settings['subscription'] ||= {}
      if self.settings['subscription']['subscription_id'] && self.settings['subscription']['subscription_id'] != opts[:subscription_id]
        self.settings['subscription']['past_subscriptions'] ||= []
        self.settings['subscription']['past_subscriptions'] << {sub_id: self.settings['subscription']['subscription_id'], cus_id: self.settings['subscription']['customer_id'], reason: 'replaced'}
        self.settings['subscription']['purchase_summary'] = nil
      end
      self.settings['subscription']['subscription_id'] = opts[:subscription_id]
      self.settings['subscription']['customer_id'] = opts[:customer_id]
      self.settings['subscription']['source_id'] = opts[:source_id]
      self.settings['subscription']['source'] = opts[:source]
      self.settings['subscription']['purchase_summary'] = opts[:purchase_summary]
      return true
    elsif opts[:state] == 'canceled' || opts[:state] == 'deleted'
      self.settings['subscription'] ||= {}
      self.settings['subscription']['past_subscriptions'] ||= []
      self.settings['subscription']['past_subscriptions'] << {sub_id: self.settings['subscription']['subscription_id'], cus_id: self.settings['subscription']['customer_id'], reason: opts[:state]}

      self.settings['subscription']['subscription_id'] = nil
      self.settings['subscription']['customer_id'] = nil
      self.settings['subscription']['source_id'] = nil
      self.settings['subscription']['source'] = nil
      self.settings['subscription']['purchase_summary'] = nil
    else
      return false
    end
  end
end

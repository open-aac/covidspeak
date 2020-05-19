require 'go_secure'

class Account < ApplicationRecord
  include SecureSerialize
  secure_serialize :settings


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
      if ts < 2.weeks.ago.to_i
        changed = true
        self.settings['codes'].delete(code)
      end
    end
    self.save if changed
  end

  def generate_temporary_code!
    self.clean_old_codes
    code = nil
    attempts = 0
    self.settings['codes'].each do |code, ts|
      if ts < 2.weeks.ago.to_i
        self.settings['codes'].delete(code)
      end
    end
    while attempts < 10 && (!code || self.settings['codes'][code])
      code = GoSecure.nonce('temporary_account_code')[0, 6].gsub(/0/, 'g').gsub(/1/, 'h')
    end
    self.settings['codes'][code] = Time.now.to_i
    self.save!

    "#{self.code}.#{code}"
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
    room.settings['account_sub_id'] = @sub_id if @sub_id
    max_live_rooms = self.settings['max_concurrent_rooms']
    max_daily_rooms = self.settings['max_daily_rooms']
    if !room.id && (max_live_rooms || max_daily_rooms)
      live_rooms = 0
      daily_rooms = 0
      recent_rooms = Room.where(account_id: self.id).where(['updated_at > ?', 24.hours.ago]).each do |room|
        next if @sub_id && room.settings['account_sub_id'] != @sub_id
        
        ended_at = room.settings['buffered_ended_at'] || room.settings['ended_at']
        if ended_at && room.settings['duration'] && room.settings['duration'] > 3
          daily_rooms += 1
        end
        if ended_at > 1.minutes.ago.to_i
          live_rooms += 1
        end
      end
      if max_live_rooms && live_rooms >= max_live_rooms
        return Room.throttle_response('too_many_live')
      elsif max_daily_rooms && daily_rooms >= max_daily_rooms
        return Room.throttle_response('too_many_daily')
      end
    end
    room
  end

  def self.valid_room_id?(room_id)
    hash, verifier = room_id.split(/:/)
    return room_id == generate_room(hash)
  end

  def verifier(identity)
    self.settings ||= {}
    salt = self.settings['salt']
    secret = self.settings['shared_secret']
    return nil unless salt && secret && identity
    secret = GoSecure.decrypt(secret, salt, 'account_hmac_sha1_verifier')
    hmac = OpenSSL::HMAC.digest('sha1', secret, identity)
    Base64.encode64(hmac).strip
  end

  def verifier=(str)
    secret, salt = GoSecure.encrypt(str, 'account_hmac_sha1_verifier')
    self.settings['salt'] = salt
    self.settings['shared_secret'] = secret
  end
end

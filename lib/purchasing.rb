require 'stripe'

module Purchasing
  def self.subscription_event(request)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    json = JSON.parse(request.body.read) rescue nil
    event_id = json && json['id']
    event = event_id && Stripe::Event.retrieve(event_id) rescue nil
    if !event || !event['type']
      return {:data => {:error => "invalid parameters", :event_id => event_id}, :status => event_id ? 200 : 400}
    end
    data = {:valid => false, :type => event['type'], :event_id => event_id}
    object = event['data'] && event['data']['object']
    previous = event['data'] && event['data']['previous_attributes']
    event_result = nil
    if object
      if event['type'] == 'customer.subscription.created' && (object['metadata'] || {})['platform_source'] == 'covidspeak'
        subscription = Stripe::Subscription.retrieve(object['id'])
        valid = subscription && subscription['metadata'] && subscription['metadata']['covidchat_account_id']
        if valid
          valid = Account.confirm_subscription({
            state: 'active',
            account_id: subscription['metadata']['covidchat_account_id'],
            subscription_id: subscription['id'],
            customer_id: subscription['customer'],
            source_id: 'stripe',
            source: 'customer.subscription.created'
          })
        end
        data = {:subscribe => true, :valid => !!valid}
      elsif event['type'] == 'customer.subscription.updated' && (object['metadata'] || {})['platform_source'] == 'covidspeak'
        subscription = Stripe::Subscription.retrieve(object['id'])
        valid = subscription && subscription['metadata'] && subscription['metadata']['covidchat_account_id']
        if subscription['status'] == 'unpaid' || subscription['status'] == 'canceled'
          if previous && previous['status'] && previous['status'] != 'unpaid' && previous['status'] != 'canceled'
            if valid
              reason = 'Monthly payment unpaid' if subscription['status'] == 'unpaid'
              reason = 'Canceled by purchasing system' if subscription['status'] == 'canceled'
              valid = Account.confirm_subscription({
                action: 'canceled',
                account_id: subscription['metadata']['covidchat_account_id'],
                subscription_id: subscription['id'],
                customer_id: subscription['customer'],
                source_id: 'stripe',
                source: 'customer.subscription.updated',
                system_cancel: true,
                cancel_reason: reason
              })
            end
            data = {:unsubscribe => true, :valid => !!valid}
          end
        elsif subscription['status'] == 'past_due'
          if previous && previous['status'] && previous['status'] != 'past_due'
            if valid
              account = Account.find_by(id: subscription['metadata']['covidchat_account_id'])
              if account
                account.settings['past_due'] = true
                accuont.save
                SubscriptionMailer.deliver_message('purchase_bounced', account)
              end
            end
          end
        elsif subscription['status'] == 'active'
          if valid
            valid = Account.confirm_subscription({
              state: 'active',
              account_id: subscription['metadata']['covidchat_account_id'],
              subscription_id: subscription['id'],
              customer_id: subscription['customer'],
              source_id: 'stripe',
              source: 'customer.subscription.updated'
            })
          end
          data = {:subscribe => true, :valid => !!valid}
        end
      elsif event['type'] == 'customer.subscription.deleted' && (object['metadata'] || {})['platform_source'] == 'covidspeak'
        subscription = Stripe::Subscription.retrieve(object['id'])
        valid = subscription && subscription['metadata'] && subscription['metadata']['covidchat_account_id']
        if valid
          valid = Account.confirm_subscription({
            state: 'deleted',
            account_id: subscription['metadata']['covidchat_account_id'],
            subscription_id: subscription['id'],
            customer_id: subscription['customer'],
            source_id: 'stripe',
            source: 'customer.subscription.deleted'
          })
        end
        data = {:unsubscribe => true, :valid => !!valid}
      elsif event['type'] == 'checkout.session.completed'  && (object['metadata'] || {})['platform_source'] == 'covidspeak'
        valid = Purchasing.confirm_purchase(object['id']) != false
        data = {:checkout => true, :valid => valid}
      elsif event['type'] == 'ping'
        data = {:ping => true, :valid => true}
      end
    end
    {:data => data, :status => 200}
  end
  
  def self.add_purchase_summary(hash, method)
    return unless method
    brand = method['card'] && method['card']['brand']
    last4 = method['card'] && method['card']['last4']
    exp_year = method['card'] && method['card']['exp_year']
    exp_month = method['card'] && method['card']['exp_month']
    if brand && last4
      hash['purchase_summary'] = brand + " card ending in " + last4
      if exp_year && exp_month
        hash['purchase_summary'] += " (exp #{exp_month}/#{exp_year})"
      end
    end
    hash['purchase_summary']
  end

  def self.purchase_prep(opts)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    price_id = ENV['STRIPE_PRICE_ID']
    session = Stripe::Checkout::Session.create({
      mode: 'setup',
      success_url: opts[:success_url],
      cancel_url: opts[:cancel_url],
      customer_email: opts[:contact_email],
      payment_method_types: ['card'],
      metadata: { platform_source: 'covidspeak' },
      # subscription_data: {
      #   metadata: { source: 'covidspeak' }
      # },
      # line_items: [{price: price_id, quantity: opts[:quantity]}]
    })
    opts['source'] = 'purchase'
    opts['initiator'] = 'new_purchase'
    opts['nonce'] = GoSecure.nonce('account_unique_nonce')
    RedisAccess.default.setex("purchase_settings/#{session.id}", 36.hours.to_i, opts.to_json)
    session.id
  end

  def self.confirm_purchase(session_id)
    # NOTE: there is a race condition, where if this
    # code is called twice at the same time, it will
    # create two paid accounts, both tied to the same
    # subscription, but someone could abuse that to
    # spread their meetings across the accounts.
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    price_id = ENV['STRIPE_PRICE_ID']
    session = Stripe::Checkout::Session.retrieve({id: session_id, expand: ['customer.invoice_settings.default_payment_method', 'subscription.default_payment_method', 'setup_intent.payment_method']})
    return false unless session
    subscription = session['subscription']
    customer = session['customer']
    method = (session['setup_intent'] || {})['payment_method']
    method ||= ((session['customer'] || {})['invoice_settings'] || {})['default_payment_method']
    method ||= (session['subscription'] || {})['default_payment']
    opts = JSON.parse(RedisAccess.default.get("purchase_settings/#{session_id}")) rescue {}
    if !customer || !subscription
      return false unless method
      # find customer (list all by email) or create customer
      # attach a new subscription with default_payment_method = method['id']
      customer = Stripe::Customer.list({email: opts['contact_email'], limit: 1, expand: ['data.subscriptions']}).data[0]
      customer ||= Stripe::Customer.create({
        email: opts['contact_email'],
        payment_method: method['id'],
        metadata: {platform_source: 'covidspeak'}
      })
      if !method['customer'] != customer['id']
        method = Stripe::PaymentMethod.retrieve(method['id'])
        method.attach({customer: customer['id']})
      end
      subscription = nil
      if opts['source'] == 'update'
        # Only on update will we change an existing subscription,
        # otherwise we would create a new one. For this app
        # it's possible for a single customer to be running
        # multiple active subscriptions
        subscription = customer.subscriptions.data.detect{|s| s.items.data.any?{|i| i['price']['id'] == price_id } && ['active', 'unpaid', 'past_due'].include?(s['status']) }
      else
        # Don't create multiple subscriptions for the same
        # purchase sequence, since the browser and webhooks
        # will both trigger the purchase processs
        subscription = customer.subscriptions.data.detect{|s| s.items.data.any?{|i| i['price']['id'] == price_id } && s.metadata['covidchat_nonce'] == opts['nonce'] }
      end
      # attach the subscription
      start_of_next_month = Date.today.beginning_of_month.to_time.to_i
      subscription ||= Stripe::Subscription.create({
        customer: customer['id'],
        items: [
          {price: price_id},
        ],
        backdate_start_date: start_of_month,
        default_payment_method: method['id'],
        metadata: { platform_source: 'covidspeak', covidchat_nonce: opts['nonce'] }
      }, {idempotency_key: "#{session_id}-#{opts['nonce']}"})
    end
    add_purchase_summary(opts, method)
    
    if method && subscription['default_payment_method'] != method['id']
      # assert default payment method on the subscription
      # this should be a noop on purchase, but on update
      # it will change billing settings correctly
      subscription = Stripe::Subscription.retrieve({id: subscription['id']})
      subscription.default_payment_method = method['id']
      subscription.save
    end
    opts = JSON.parse(RedisAccess.default.get("purchase_settings/#{session_id}")) rescue {}
    account = Account.find_by(id: opts['account_id']) if opts['account_id']
    account ||= Account.find_by(id: subscription['metadata']['covidchat_account_id']) if subscription['metadata'] && subscription['metadata']['covidchat_account_id']
    account ||= Account.find_by(code: opts['join_code']) if opts['join_code']
    if account
      account.settings['subscription'] ||= {}
      if account.id == opts['account_id'] && account.settings['subscription']['subscription_id'] && account.settings['subscription']['subscription_id'] != subscription['id']
        # This (existing) account currently has a different subscription_id
        account.log_subscription_event({:log => 'overwriting subscription', :current_id => account.settings['subscription']['subscription_id'], :asserted_id => session['subscription']})
        account.settings['subscription']['subscription_id'] = nil
      end
      if account.settings['subscription']['subscription_id'] && account.settings['subscription']['subscription_id'] != subscription['id']
        # On mismatch, just fall back to creating a new 
        # account with a longer join code so you don't lose 
        # the purchase process
        account.log_subscription_event({:log => 'mismatched subscription', :current_id => account.settings['subscription']['subscription_id'], :asserted_id => session['subscription']})
        opts['join_code'] += rand(99)
        while Account.find_by(code: opts['join_code']) do
          opts['join_code'] += rand(99)
        end
        RedisAccess.default.setex("purchase_settings/#{session_id}", 36.hours.to_i, opts.to_json)
        account = nil
      else
        do_email = account.settings['subscription']['purchase_summary'] != opts['purchase_summary']
        account.settings['subscription']['purchase_summary'] = opts['purchase_summary'] || account.settings['subscription']['purchase_summary']
        account.settings['subscription']['last_purchase_update_source'] = opts['source']
        # TODO: email about purchase information being updated if do_email
        account.save
        account.log_subscription_event({:log => 'already confirmed subscription', :id => subscription['id']})
        Account.confirm_subscription({
          state: 'active',
          account_id: account.id,
          subscription_id: subscription['id'],
          customer_id: customer['id'],
          source_id: 'stripe',
          source: 'web.purchase.updated',
          purchase_summary: opts['purchase_summary']          
        })
        opts['account_id'] = account.id
        RedisAccess.default.setex("purchase_settings/#{session_id}", 36.hours.to_i, opts.to_json)
        if (subscription['metadata'] || {})['covidchat_account_id'] != account.external_id
          subscription.metadata ||= {}
          subscription.metadata['covidchat_account_id'] = account.external_id
          subscription.save
        end
        return account
      end
    end
    while opts['join_code'].length < 10 || Account.find_by(code: opts['join_code'])
      opts['join_code'] += rand(99).to_s
    end
    RedisAccess.default.setex("purchase_settings/#{session_id}", 36.hours.to_i, opts.to_json)
    account = Account.new
    account.code = opts['join_code'].to_s
    account.settings ||= {}
    account.settings['name'] = (opts['name'] || 'Account Name Lost').to_s
    account.settings['free_account'] = false
    account.settings['subscription'] ||= {}
    account.settings['subscription']['last_purchase_update_source'] = opts['source']
    account.settings['contact_name'] = (opts['contact_name'] || 'Contact Name Lost').to_s
    account.settings['contact_email'] = (opts['contact_email'] || customer['email']).to_s
    config_server = (ENV['PURCHASE_ACCOUNT_CODES_POOL'] || 'test').split(',').sample
    account.copy_server_from(config_server)
    account.settings['max_concurrent_rooms'] = [1, opts['quantity'].to_i].max
    account.save!
    opts['account_id'] = account.id
    RedisAccess.default.setex("purchase_settings/#{session_id}", 36.hours.to_i, opts.to_json)
    customer_meta = customer['metadata'] || {}
    if (subscription['metadata'] || {})['covidchat_account_id'] != account.external_id
      subscription.metadata ||= {}
      subscription.metadata['covidchat_account_id'] = account.external_id
      subscription.save
    end
    if (customer_meta['covidchat_account_id'] != account.external_id) || customer_meta['platform_source']
      customer.metadata ||= {}
      customer.metadata['covidchat_account_id'] = account.external_id
      customer.save
    end
    account.log_subscription_event({:log => 'confirming subscription', :id => subscription['id']})
    Account.confirm_subscription({
      state: 'active',
      account_id: account.id,
      subscription_id: subscription['id'],
      customer_id: customer['id'],
      source_id: 'stripe',
      source: 'web.purchase',
      purchase_summary: opts['purchase_summary']          
    })
    account.reload
    account
  end

  def self.purchase_modify(opts)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
      session = Stripe::Checkout::Session.create({
      mode: 'setup',
      customer_email: opts[:contact_email],
      customer: opts[:customer_id],
      metadata: { platform_source: 'covidspeak' },
      payment_method_types: ['card'],
      # subscription_data: {
      #   metadata: { source: 'covidspeak' }
      # },
      setup_intent_data: {
        metadata: { subscription_id: opts[:subscription_id] }
      },
      success_url: opts[:success_url],
      cancel_url: opts[:cancel_url]
    })
    opts['initiator'] = 'update_or_set_billing'
    opts['source'] = opts[:subscription_id] ? 'update' : 'purchase'
    opts['nonce'] = GoSecure.nonce('account_unique_nonce')
    RedisAccess.default.setex("purchase_settings/#{session.id}", 36.hours.to_i, opts.to_json)
    session.id
  end

  def self.update_meter(account, opts)
    opts['action'] = 'set'
    opts['timestamp'] = Time.now.to_i
    month_start = Date.today.beginning_of_month
    start_of_month = month_start.to_time.to_i
    if account.settings['subscription']['last_meter_update']
      if account.settings['subscription']['last_meter_update']['quantity'] >= opts[:quantity] && account.settings['subscription']['last_meter_update']['timestamp'] > start_of_month
        # No need to re-send if we already successfully sent this amount
        return true
      end
    end
    # https://stripe.com/docs/billing/subscriptions/metered-billing
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    sub = Stripe::Subscription.retrieve(account.settings['subscription']['subscription_id']) rescue nil
    if !sub
      account.log_subscription_event({error: 'no subscription found when updating meter'})
      return false
    end
    if sub['metadata']['covidchat_account_id'] != account.external_id
      account.log_subscription_event({error: 'subscription tied to a different account'})
      account.settings['disabled'] = true
      return false
    end
    sub_item = sub.items.data.detect{|si| si['price']['id'] == ENV['STRIPE_PRICE_ID'] }
    if !sub_item
      account.log_subscription_event({error: 'no matching subscription item found when updating meter'})
      return false
    end
    usage = Stripe::SubscriptionItem.create_usage_record(
      sub_item.id,
      opts,
    ) rescue nil
    if usage
      account.settings['subscription']['last_meter_update'] = opts
      account.settings['subscription']['months'] ||= {}
      account.settings['subscription']['months'][month_start.iso8601] = (account.settings['subscription']['months'][month_start.iso8601] || {}).merge(opts)
      account.save
      return true
    else
      account.log_subscription_event({error: 'failed to create usage'}) unless usage
      return false
    end
  end

  def self.output(str)
    puts str
  end
  
  def self.cancel_subscription(account, customer_id, subscription_id, reason)
    return false unless account
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    begin
      customer = Stripe::Customer.retrieve(customer_id)
    rescue => e
      account.log_subscription_event({:log => 'subscription canceling error', :detail => 'error retrieving customer', :error => e.to_s, :trace => e.backtrace})
    end
    
    if customer
      if !customer.metadata || customer.metadata['covidchat_account_id'] != account.external_id
        account.log_subscription_event({:log => 'customer metadata mismatch, cancel not possible', :metadata_account_id => customer.metadata['covidchat_account_id'], :current_account_id => account.id})
        return false
      end
      
      begin
        sub = nil
        customer.subscriptions.auto_paging_each do |s|
          sub = s if s['id'] == subscription_id
        end
      rescue => e
        account.log_subscription_event({:log => 'subscription canceling error', :detail => 'error retrieving subscriptions', :error => e.to_s, :trace => e.backtrace})
      end
      
      if sub && sub['status'] != 'canceled' && sub['status'] != 'past_due'
        begin
          sub.cancel_at_period_end = true
          sub.save
          account.log_subscription_event({:log => 'subscription canceling success', id: sub['id'], reason: subscription_id})
          Account.confirm_subscription({
            state: 'deleted',
            account_id: account.id,
            cancel_reason: reason,
            subscription_id: subscription_id,
            customer_id: customer_id,
            source_id: 'stripe',
            source: 'user.cancelled'
          })
          return true
        rescue => e
          account.log_subscription_event({:log => 'subscription canceling error', :detail => 'error canceling subscription', :error => e.to_s, :trace => e.backtrace})
        end
      elsif sub
        account.log_subscription_event({:log => 'subscription already canceled or past-due', id: subscription_id})
      else
        account.log_subscription_event({:log => 'subscription not found', id: subscription_id})
      end
    end
    false
  end
end
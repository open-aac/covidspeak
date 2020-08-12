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
        customer = Stripe::Customer.retrieve(object['customer'])
        valid = customer && customer['metadata'] && customer['metadata']['covidchat_account_id']
        if valid
          valid = Account.confirm_subscription({
            state: 'active',
            account_id: customer['metadata']['covidchat_account_id'],
            subscription_id: object['id'],
            customer_id: object['customer'],
            source_id: 'stripe',
            source: 'customer.subscription.created'
          })
        end
        data = {:subscribe => true, :valid => !!valid}
      elsif event['type'] == 'customer.subscription.updated' && (object['metadata'] || {})['platform_source'] == 'covidspeak'
        customer = Stripe::Customer.retrieve(object['customer'])
        valid = customer && customer['metadata'] && customer['metadata']['covidchat_account_id']
        if object['status'] == 'unpaid' || object['status'] == 'canceled'
          if previous && previous['status'] && previous['status'] != 'unpaid' && previous['status'] != 'canceled'
            if valid
              reason = 'Monthly payment unpaid' if object['status'] == 'unpaid'
              reason = 'Canceled by purchasing system' if object['status'] == 'canceled'
              valid = Account.confirm_subscription({
                action: 'canceled',
                account_id: customer['metadata']['covidchat_account_id'],
                subscription_id: object['id'],
                customer_id: object['customer'],
                source_id: 'stripe',
                source: 'customer.subscription.updated',
                system_cancel: true,
                cancel_reason: reason
              })
            end
            data = {:unsubscribe => true, :valid => !!valid}
          end
        elsif object['status'] == 'past_due'
          if previous && previous['status'] && previous['status'] != 'past_due'
            if valid
              account = Account.find_by(id: customer['metadata']['covidchat_account_id'])
              if account
                account.settings['past_due'] = true
                accuont.save
                SubscriptionMailer.deliver_message('purchase_bounced', account)
              end
            end
          end
        elsif object['status'] == 'active'
          if valid
            valid = Account.confirm_subscription({
              state: 'active',
              account_id: customer['metadata']['covidchat_account_id'],
              subscription_id: object['id'],
              customer_id: object['customer'],
              source_id: 'stripe',
              source: 'customer.subscription.updated'
            })
          end
          data = {:subscribe => true, :valid => !!valid}
        end
      elsif event['type'] == 'customer.subscription.deleted' && (object['metadata'] || {})['platform_source'] == 'covidspeak'
        customer = Stripe::Customer.retrieve(object['customer'])
        valid = customer && customer['metadata'] && customer['metadata']['covidchat_account_id']
        if valid
          valid = Account.confirm_subscription({
            state: 'deleted',
            account_id: customer['metadata']['covidchat_account_id'],
            subscription_id: object['id'],
            customer_id: object['customer'],
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
    RedisAccess.default.setex("purchase_settings/#{session.id}", 36.hours.to_i, opts.to_json)
    session.id
  end

  def self.confirm_purchase(session_id)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    price_id = ENV['STRIPE_PRICE_ID']
    opts = JSON.parse(RedisAccess.default.get("purchase_settings/#{session_id}")) rescue {}
    session = Stripe::Checkout::Session.retrieve({id: session_id, expand: ['customer.invoice_settings.default_payment_method', 'subscription.default_payment_method', 'setup_intent.payment_method']})
    return false unless session
    subscription = session['subscription']
    customer = session['customer']
    method = (session['setup_intent'] || {})['payment_method']
    method ||= ((session['customer'] || {})['invoice_settings'] || {})['default_payment_method']
    method ||= (session['subscription'] || {})['default_payment']
    if !customer || !subscription
      return false unless method
      # find customer (list all by email) or create customer
      # attach a new subscription with default_payment_method = method['id']
      customer = Stripe::Customer.list({email: opts['contact_email'], limit: 1}).data[0]
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
      end
      # attach the subscription
      subscription ||= Stripe::Subscription.create({
        customer: customer['id'],
        items: [
          {price: price_id},
        ],
        default_payment_method: method['id'],
        metadata: { platform_source: 'covidspeak' }
      })
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
        # On mismatch, just create a new account with a longer
        # join code so you don't lose the purchase process
        account.log_subscription_event({:log => 'mismatched subscription', :current_id => account.settings['subscription']['subscription_id'], :asserted_id => session['subscription']})
        opts['join_code'] += rand(99)
        while Account.find_by(code: opts['join_code']) do
          opts['join_code'] += rand(99)
        end
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
    customer_meta = customer['metadata'] || {}
    if (customer_meta['covidchat_account_id'] != account.external_id) || customer_meta['platform_source']
      customer.metadata ||= {}
      customer.metadata['covidchat_account_id'] = account.external_id
      customer.save
    end
    if (subscription['metadata'] || {})['covidchat_account_id'] != account.external_id
      subscription.metadata ||= {}
      subscription.metadata['covidchat_account_id'] = account.external_id
      subscription.save
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
    if sub['customer'] != account.settings['subscription']['customer_id']
      account.log_subscription_event({error: 'no customer found when updating meter'})
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

  
  def self.reconcile(with_side_effects=false)
    Stripe.api_key = ENV['STRIPE_SECRET_KEY']
    Stripe.api_version = '2020-03-02'
    customers = Stripe::Customer.list(:limit => 10)
    customer_active_ids = []
    total = 0
    cancel_months = {}
    cancels = {}
    output "retrieving expired subscriptions..."
    Stripe::Subscription.list(:limit => 20, :status => 'canceled').auto_paging_each do |sub|
      cancels[sub['customer']] ||= []
      cancels[sub['customer']] << sub
    end
    output "retrieving charges..."
    list = Stripe::Charge.list(:limit => 20)
    big_charges = []
    tallies = {}
    while(list && list.data && list.data[0] && list.data[0].created > 3.months.ago.to_i)
      list.data.each do |charge|
        if charge.captured && !charge.refunded
          date = Time.at(charge.created).iso8601[0, 7]
          tallies[date] = (tallies[date] || 0) + (charge.amount / 100)
          if charge.amount > 90
            big_charges << charge
          end
        end
      end
      list = list.next_page
      output "..."
    end
    tally_months = {}
    big_charges.each do |charge|
      time = Time.at(charge.created)
      date = time.iso8601[0, 7]
      if charge.amount > 225
        tally_months[date] = (tally_months[date] || 0) + (charge.amount / 100 / 150).floor
      else
        tally_months[date] = (tally_months[date] || 0) + 1
      end
    end.length
    problems = []
    user_active_ids = []
    years = {}
    customers.auto_paging_each do |customer|
      total += 1
      cus_id = customer['id']
      email = customer['email']
      output "checking #{cus_id} #{email}"
      if !customer
        output "\tcustomer not found"
        next
      end
      user_id = customer['metadata'] && customer['metadata']['user_id']
      user = user_id && User.find_by_global_id(user_id)
      if !user && cancels[customer['id']].blank?
        problems << "#{customer['id']} no user found"
        output "\tuser not found"
        next
      end

      customer_subs = customer['subscriptions'].to_a
      user_active = user && user.recurring_subscription?
      user_active_ids << user.global_id if user_active
      customer_active = false
      
      if customer_subs.length > 1
        output "\ttoo many subscriptions"
        problems << "#{user.global_id} #{user.user_name} too many subscriptions"
      elsif user && user.long_term_purchase?
        subs = cancels[cus_id] || []
        sub = subs[0]
        str = "\tconverted to a long-term purchase"

        if sub && sub['canceled_at']
          canceled = Time.at(sub['canceled_at'])
          str += " on #{canceled.iso8601}"
        end
        if sub && sub['created']
          created = Time.at(customer['created'])
          str += ", subscribed #{created.iso8601}"
        end
        output str
        if customer_subs.length > 0
          sub = customer_subs[0]
          if sub && (sub['status'] == 'active' || sub['status'] == 'trialing')
            output "\tconverted to long-term purchase, but still has a lingering subscription"
            problems << "#{user.global_id} #{user.user_name} converted to long-term purchase, but still has a lingering subscription"
          end
        end
      elsif customer_subs.length == 0 
        # if no active subscription, this is an old customer record
        check_cancels = false
        # if customer id matches, then we are properly aligned
        if user && user.settings['subscription'] && user.settings['subscription']['customer_id'] == cus_id
          check_cancels = true
          if user_active
            output "\tno subscription found, but expected (FREELOADER)" 
            problems << "#{user.global_id} #{user.user_name} no subscription found, but expected (FREELOADER)"
          end
          if user_active && with_side_effects
            User.schedule(:subscription_event, {
              'unsubscribe' => true,
              'user_id' => user.global_id,
              'customer_id' => cus_id,
              'subscription_id' => object['id'],
              'cancel_others_on_update' => true,
              'source' => 'customer.reconciliation'
            })
          else
            if user_active
              output "\tuser active without a subscription (huh?)" 
              problems << "#{user.global_id} #{user.user_name} user active without a subscription (huh?)"
            end

          end
        else
          # if customer id doesn't match on subscription hash then we don't really care,
          # since there are no subscriptions for this customer, we just shouldn't
          # track this as a cancellation
          if user_active
          else
            check_cancels = true
          end
        end
        if check_cancels
          # Will only get here if there are no active subscriptions in purchasing system
          subs = cancels[cus_id] || []
          sub = subs[0]
          if sub
            canceled = Time.at(sub['canceled_at'])
            created = Time.at(customer['created'])
            # If canceled in the last 6 months, track it for reporting
            if canceled > 6.months.ago
              if user_active
                problems << "#{user.global_id} marked as canceled, but looks like still active"
              end 
              output "\tcanceled #{canceled.iso8601}, subscribed #{created.iso8601}, active #{user_active}" if canceled > 3.months.ago
              cancel_months[(canceled.year * 100) + canceled.month] ||= []
              cancel_months[(canceled.year * 100) + canceled.month] << (canceled - created) / 1.month.to_i
            end
          end
        end
      else
        sub = customer_subs[0]
        if sub && sub['start']
          time = Time.at(sub['start']) rescue nil
          if time
            yr = 0
            if time < 3.years.ago
              yr = 3
            elsif time < 2.years.ago
              yr = 2
            elsif time < 1.years.ago
              yr = 1
            elsif time < 4.months.ago
              yr = 0.3
            end
            years[yr] = (years[yr] || 0) + 1
          end
        end
        if user && user.settings['subscription'] && user.settings['subscription']['customer_id'] == cus_id
          customer_active = sub['status'] == 'active'
          customer_active_ids << user.global_id if customer_active
          if user_active != customer_active
            output "\tcustomer is #{sub['status']} but user is #{user_active ? 'subscribed' : 'expired'}" 
            problems << "#{user.global_id} #{user.user_name} customer is #{sub['status']} but user is #{user_active ? 'subscribed' : 'expired'}"
          end
        else
          # if customer id doesn't match on subscription hash:
          # - if the subscription is active, we have a problem
          # - otherwise we can ignore this customer record
          if user_active
            if sub['status'] == 'active' || sub['status'] == 'trialing'
              output "\tcustomer is #{sub['status']} but user is tied to a different customer record #{user.settings['subscription']['customer_id']}" 
              problems << "#{user.global_id} #{user.user_name} but user is tied to a different customer record #{user.settings['subscription']['customer_id']}"
            end
          end
        end
      end
    end
    if problems.length > 0
      output "PROBLEMS:\n#{problems.join("\n")}\n"
    end
    output "PURCHASES: #{tallies.to_json}"
    output "LICENSES (approx): #{tally_months.to_json}"
    output "YEARS: #{years.to_json}"
    output "TOTALS: checked #{total}, paying customers (not trialing, not duplicates) #{customer_active_ids.uniq.length}, subscription users #{user_active_ids.uniq.length}"
    cancel_months.each{|k, a| 
      res = []
      res << (cancel_months[k].sum / cancel_months[k].length.to_f).round(1) 
      res << (cancel_months[k].length)
      cancel_months[k] = res
    }
    output "CANCELS: #{cancel_months.to_a.sort_by(&:first).reverse.to_json}"
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